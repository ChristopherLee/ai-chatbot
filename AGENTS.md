# AGENTS.md

## Debugging Workflow

- When code, logs, or the UI do not provide enough context to debug an issue, use the Supabase MCP tools instead of guessing.
- If the issue is tied to a specific conversation or finance workflow, ask for the `chatId` if it is not already provided.
- Treat `chatId` as the primary debugging handle. Start with `Chat` to recover the linked `projectId`, `userId`, and other persisted metadata.
- Use the `chatId` to inspect chat-specific records such as `Message_v2`, `Vote_v2`, and `Stream`.
- Use the `projectId` derived from `Chat` to inspect project-scoped records such as `Project`, `UploadedFile`, `Transaction`, `FinanceOverride`, and `FinancePlan`.
- Prefer read-only Supabase MCP investigation first, especially `list_tables`, `execute_sql` with `SELECT`, and `get_logs`.
- Only change database data or schema when the task explicitly requires it.
- Query only the columns needed for the investigation, and avoid pasting sensitive data or secrets into user-facing responses.
- When you diagnose an issue with Supabase MCP, note the exact `chatId` and the tables you checked so the investigation is reproducible.

## UI Chat Verification

- For a real browser-backed finance chat check, start the app locally and run `pnpm verify:chat-flow`.
- `pnpm verify:chat-flow` uses headless Playwright against the live UI at `http://localhost:3000`, uploads `data/transactions.sample.csv`, waits for the onboarding prompt, sends `We want a more conservative plan and mortgage changes in April to 3200.`, and verifies both the assistant reply and the `Plan summary` dashboard state.
- The verification script assumes the app is already running. Use `pnpm dev:local` first if needed.
- Do not rely on `pnpm test` for this specific check. `scripts/run-playwright-tests.mjs` sets `PLAYWRIGHT=true`, which switches `lib/ai/providers.ts` to mocked models instead of the real model path.
- If the desktop Playwright browser bridge is blocked by an existing Chrome session, fall back to the shell-driven `pnpm verify:chat-flow` flow above.
