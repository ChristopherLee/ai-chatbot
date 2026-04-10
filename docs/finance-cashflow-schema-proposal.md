# Finance cash flow persistence schema proposal

## Goals

Support durable storage for the new planning capabilities:

- cash-flow scenarios (e.g. Base, Conservative, Aggressive)
- month-level overrides for income and budget
- month+category overrides for one-off category changes
- optional row-level notes for partner-style planning context
- reproducible chart payload inputs from persisted data

## Design principles

1. **Project-scoped planning**: everything is anchored to `Project.id`.
2. **Scenario-first model**: users can maintain multiple plans per project.
3. **Append-only where useful**: include timestamps for auditability.
4. **Unified override ledger**: all budget visuals should read the same persisted monthly override source.
5. **Normalized monthly overrides**: avoid large JSON blobs for queryability.

## Proposed tables

### 1) `FinanceScenario`

A named plan/simulation profile for a project.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Scenario id |
| `projectId` | UUID FK -> `Project.id` | Project scope |
| `name` | TEXT | User-facing label (`Base`, `Conservative`, etc.) |
| `isDefault` | BOOLEAN | Exactly one default per project |
| `startMonth` | CHAR(7) nullable | Optional scenario horizon start (`YYYY-MM`) |
| `endMonth` | CHAR(7) nullable | Optional scenario horizon end (`YYYY-MM`) |
| `notes` | TEXT nullable | Freeform scenario context |
| `createdBy` | UUID FK -> `User.id` nullable | Optional actor |
| `createdAt` | TIMESTAMPTZ | Audit |
| `updatedAt` | TIMESTAMPTZ | Audit |

**Indexes/constraints**

- `UNIQUE(projectId, lower(name))`
- partial unique index for default scenario: `UNIQUE(projectId) WHERE isDefault = true`
- index on `(projectId, updatedAt DESC)`

---

### 2) `FinanceScenarioBudgetOverride`

Single source of truth for **all budget overrides** (monthly total and per-category),
so every budget visualization resolves targets from the same table.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `scenarioId` | UUID FK -> `FinanceScenario.id` | Scenario scope |
| `month` | CHAR(7) | `YYYY-MM` |
| `scope` | TEXT | `total_budget` or `category_budget` |
| `category` | TEXT nullable | Required when `scope = category_budget` |
| `amount` | NUMERIC(14,2) | Override value |
| `isOneOff` | BOOLEAN | True for explicit one-time month override |
| `note` | TEXT nullable | Optional month rationale |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

**Indexes/constraints**

- `UNIQUE(scenarioId, month, scope, lower(coalesce(category, '')))`
- index on `(scenarioId, month)`

---

### 3) `FinanceScenarioIncomeOverride`

Month-level income overrides (kept separate from budget to avoid mixing semantics).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `scenarioId` | UUID FK -> `FinanceScenario.id` | Scenario scope |
| `month` | CHAR(7) | `YYYY-MM` |
| `projectedIncome` | NUMERIC(14,2) | Month income override |
| `note` | TEXT nullable | Why this month differs |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

**Indexes/constraints**

- `UNIQUE(scenarioId, month)`
- index on `(scenarioId, month)`

---

### 4) `FinanceScenarioAssumption`

Optional key/value assumptions for non-month-specific model knobs.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `scenarioId` | UUID FK -> `FinanceScenario.id` | |
| `key` | TEXT | e.g. `incomeGrowthRate`, `inflationRate` |
| `valueJson` | JSONB | typed value blob |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

**Indexes/constraints**

- `UNIQUE(scenarioId, key)`

---

### 5) `FinanceScenarioEvent` (optional but recommended)

Timeline events to represent discrete changes (raise, bonus, insurance increase).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `scenarioId` | UUID FK -> `FinanceScenario.id` | |
| `effectiveMonth` | CHAR(7) | `YYYY-MM` |
| `eventType` | TEXT | `income_change`, `category_change`, `debt_change`, etc. |
| `payloadJson` | JSONB | Event-specific payload |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

**Indexes/constraints**

- index on `(scenarioId, effectiveMonth)`

## How this maps to current UI behavior

- **Editable projected expense (monthly total) cells** -> `FinanceScenarioBudgetOverride` with `scope=total_budget`.
- **Per-month category drilldowns** -> `FinanceScenarioBudgetOverride` rows with `scope=category_budget`.
- **One-off customizations** -> `isOneOff = true` on budget override rows.
- **Editable projected income cells** -> `FinanceScenarioIncomeOverride.projectedIncome`.
- **Multiple partner experiments** -> separate `FinanceScenario` records.

## Derivation algorithm (read path)

For each month in chart horizon:

1. Resolve base income/expense from existing targets + historical model.
2. Apply `FinanceScenarioIncomeOverride` for top-line income, if present.
3. Build category projections from planner baseline.
4. Apply matching `FinanceScenarioBudgetOverride` category rows for the month.
5. If a `FinanceScenarioBudgetOverride` total row exists for the month, use it as canonical monthly budget target.
6. Reconcile category total vs top-line projected expense:
   - either scale uncapped categories proportionally, or
   - show a "difference" bucket for explicit user control.

## Migration/rollout approach

1. Add new tables and indexes.
2. Create a default scenario for each project with finance data.
3. Backfill current persistent targets (`FinanceOverride`) into `FinanceScenarioBudgetOverride` rows in the default scenario.
4. Update chart + table APIs to load/save against selected scenario id.
5. Add optimistic UI for month/category edits with server commit.

## API contract sketch

- `GET /api/finance/scenarios?projectId=...`
- `POST /api/finance/scenarios`
- `PATCH /api/finance/scenarios/:id`
- `PUT /api/finance/scenarios/:id/months/:month/income`
- `PUT /api/finance/scenarios/:id/months/:month/budget-total`
- `PUT /api/finance/scenarios/:id/months/:month/categories/:category`
- `DELETE /api/finance/scenarios/:id/months/:month/categories/:category`

## Why not a single JSONB blob?

A single blob would be quicker initially but makes filtering, auditing, and partial updates harder. The normalized approach keeps write operations simple while preserving queryability and future analytics.
