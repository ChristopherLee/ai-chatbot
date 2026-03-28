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
