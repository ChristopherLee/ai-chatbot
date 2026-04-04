import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", override: true });

const SOURCE_URL = process.env.POSTGRES_URL;
const TARGET_URL = process.env.POSTGRES_URL_NEW;
const FORCE_RESET = process.env.ALLOW_TARGET_RESET === "1";
const BATCH_SIZE = Number(process.env.DB_TRANSFER_BATCH_SIZE ?? 500);

if (!SOURCE_URL) {
  throw new Error("POSTGRES_URL is required in .env.local.");
}

if (!TARGET_URL) {
  throw new Error("POSTGRES_URL_NEW is required in .env.local.");
}

if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE <= 0) {
  throw new Error("DB_TRANSFER_BATCH_SIZE must be a positive integer.");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "..", "lib", "db", "migrations");

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

async function getPublicTables(sql) {
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name;
  `;

  return rows.map((row) => row.table_name);
}

async function getExactCounts(sql, tables) {
  const counts = {};

  for (const table of tables) {
    const result = await sql.unsafe(
      `select count(*)::bigint as count from public.${quoteIdent(table)}`
    );
    counts[table] = Number(result[0]?.count ?? 0);
  }

  return counts;
}

async function getForeignKeys(sql) {
  return sql`
    select
      tc.table_name,
      ccu.table_name as foreign_table_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
    order by tc.table_name, ccu.table_name;
  `;
}

function topologicalOrder(tables, foreignKeys) {
  const dependencyMap = new Map(
    tables.map((table) => [table, new Set()])
  );
  const reverseDependencyMap = new Map(
    tables.map((table) => [table, new Set()])
  );
  const inDegree = new Map(tables.map((table) => [table, 0]));

  for (const relation of foreignKeys) {
    if (
      !dependencyMap.has(relation.table_name) ||
      !dependencyMap.has(relation.foreign_table_name)
    ) {
      continue;
    }

    const dependencies = dependencyMap.get(relation.table_name);
    if (!dependencies.has(relation.foreign_table_name)) {
      dependencies.add(relation.foreign_table_name);
      inDegree.set(relation.table_name, inDegree.get(relation.table_name) + 1);
      reverseDependencyMap
        .get(relation.foreign_table_name)
        .add(relation.table_name);
    }
  }

  const ready = tables.filter((table) => inDegree.get(table) === 0).sort();
  const ordered = [];

  while (ready.length > 0) {
    const next = ready.shift();
    ordered.push(next);

    for (const dependent of reverseDependencyMap.get(next)) {
      inDegree.set(dependent, inDegree.get(dependent) - 1);

      if (inDegree.get(dependent) === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  if (ordered.length !== tables.length) {
    const unresolved = tables.filter((table) => !ordered.includes(table));
    throw new Error(
      `Unable to determine a safe table order due to cyclic dependencies: ${unresolved.join(", ")}`
    );
  }

  return ordered;
}

async function getColumns(sql, table) {
  const rows = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
    order by ordinal_position;
  `;

  return rows.map((row) => row.column_name);
}

async function runMigrations(target) {
  const db = drizzle(target);

  console.log("Running target migrations...");
  await migrate(db, { migrationsFolder });
}

async function truncateTargetTables(target, tables) {
  if (tables.length === 0) {
    return;
  }

  const qualifiedTables = tables
    .map((table) => `public.${quoteIdent(table)}`)
    .join(", ");

  console.log("Resetting target rows before copy...");
  await target.unsafe(`truncate table ${qualifiedTables} cascade;`);
}

async function copyTable(source, target, table) {
  const columns = await getColumns(source, table);

  if (columns.length === 0) {
    return 0;
  }

  const columnList = columns.map(quoteIdent).join(", ");
  const rows = await source.unsafe(
    `select ${columnList} from public.${quoteIdent(table)}`
  );

  if (rows.length === 0) {
    return 0;
  }

  let inserted = 0;

  for (const batch of chunk(rows, BATCH_SIZE)) {
    const values = [];
    const tupleSql = batch
      .map((row) => {
        const placeholders = columns.map((column) => {
          values.push(normalizeValue(row[column]));
          return `$${values.length}`;
        });

        return `(${placeholders.join(", ")})`;
      })
      .join(", ");

    const insertSql = `insert into public.${quoteIdent(table)} (${columnList}) values ${tupleSql}`;
    await target.unsafe(insertSql, values);
    inserted += batch.length;
  }

  return inserted;
}

async function main() {
  const source = postgres(SOURCE_URL, { max: 1, prepare: false });
  const target = postgres(TARGET_URL, { max: 1, prepare: false });

  try {
    const sourceIdentity = await source`
      select current_database() as db, current_user as usr;
    `;
    const targetIdentity = await target`
      select current_database() as db, current_user as usr;
    `;

    console.log(
      `Source: ${sourceIdentity[0].usr}@${sourceIdentity[0].db}`
    );
    console.log(
      `Target: ${targetIdentity[0].usr}@${targetIdentity[0].db}`
    );

    await runMigrations(target);

    const sourceTables = await getPublicTables(source);
    const targetTables = await getPublicTables(target);
    const sourceCounts = await getExactCounts(source, sourceTables);
    const transferTables = sourceTables.filter((table) => targetTables.includes(table));
    const populatedTables = transferTables.filter((table) => sourceCounts[table] > 0);

    if (populatedTables.length === 0) {
      console.log("No populated source tables found. Nothing to transfer.");
      return;
    }

    const missingTargetTables = populatedTables.filter(
      (table) => !targetTables.includes(table)
    );

    if (missingTargetTables.length > 0) {
      throw new Error(
        `Target database is missing populated source tables: ${missingTargetTables.join(", ")}`
      );
    }

    const foreignKeys = await getForeignKeys(source);
    const orderedTables = topologicalOrder(transferTables, foreignKeys);
    const targetCountsBefore = await getExactCounts(target, targetTables);
    const nonEmptyTargetTables = targetTables.filter(
      (table) => targetCountsBefore[table] > 0
    );

    if (nonEmptyTargetTables.length > 0 && !FORCE_RESET) {
      throw new Error(
        `Target database already has data in: ${nonEmptyTargetTables.join(", ")}. ` +
          "Set ALLOW_TARGET_RESET=1 to truncate the target tables before copying."
      );
    }

    if (nonEmptyTargetTables.length > 0) {
      await truncateTargetTables(target, targetTables);
    }

    console.log(`Copy order: ${orderedTables.join(" -> ")}`);

    for (const table of orderedTables) {
      const inserted = await copyTable(source, target, table);
      console.log(`Copied ${inserted} rows into ${table}`);
    }

    const targetCountsAfter = await getExactCounts(target, transferTables);
    const mismatches = transferTables.filter(
      (table) => sourceCounts[table] !== targetCountsAfter[table]
    );

    if (mismatches.length > 0) {
      const details = mismatches
        .map(
          (table) =>
            `${table}: source=${sourceCounts[table]} target=${targetCountsAfter[table]}`
        )
        .join("; ");
      throw new Error(`Row count verification failed. ${details}`);
    }

    console.log("Transfer complete. Verified row counts:");
    for (const table of transferTables) {
      console.log(`- ${table}: ${targetCountsAfter[table]}`);
    }
  } finally {
    await Promise.all([
      source.end({ timeout: 5 }),
      target.end({ timeout: 5 }),
    ]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
