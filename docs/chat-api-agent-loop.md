# Chat API and Agent Loop

This document focuses on:

- the chat API contract,
- the execution loop for model + tools,
- how new user messages are added,
- how errors are shown to users,
- and how retries work.

## 1) Chat API contract (`POST /api/chat`)

Request body (`app/(chat)/api/chat/schema.ts`):

- `id` (chat UUID)
- `projectId` (optional UUID)
- `selectedChatModel` (string)
- `selectedVisibilityType` (`public | private`)
- either:
  - `message` for a new user turn (strict user message schema), or
  - `messages` for continuation/tool-approval flows (permissive schema).

### Why two shapes exist

The frontend intentionally sends **just the latest user message** for ordinary turns and **full message arrays** for continuation contexts. This distinction lets the backend:

- minimize payloads for normal turns,
- preserve precise context for retries/tool approvals.

## 2) How new user messages are added

## Frontend path

1. User types/sends in `MultimodalInput`.
2. `components/chat.tsx` calls `sendMessageWithAutoDenyPendingToolApprovals(...)`.
3. Pending unresolved approvals are auto-denied first (to prevent blocked state).
4. `buildChatTransportBody(...)` emits a `message` payload for a normal user turn.

## Backend path

Inside `POST /api/chat`:

1. Validate/auth/rate-limit/ownership checks run.
2. For new chats, backend creates `Project` and `Chat` if needed.
3. When `incomingMessage.role === "user"`, backend immediately persists it with `saveMessages(...)`.
4. Backend reconstructs full UI history:
   - DB messages + incoming message for normal turns, or
   - request `messages` for continuation turns.
5. Model-facing messages are sanitized (`sanitizeUIMessagesForModel`) and converted.

Result: new user input is durably saved before generation and included in the exact turn context.

## 3) Agent loop execution model

The loop is powered by `streamText(...)` inside `createUIMessageStream(...).execute`.

### Loop mechanics

- The model receives system prompt + message history.
- Tool calling is enabled by `experimental_activeTools` + `tools` map.
- `stopWhen: stepCountIs(N)` caps loop depth (5 standard, 6 finance).
- The streamed UI message parts include text, reasoning, tool states, approvals, and outputs.

### Tool approval sub-loop

For tools that require approval, parts can move through states such as:

- `approval-requested`
- `approval-responded`
- `output-available`
- `output-denied`

Frontend renders these states and sends `addToolApprovalResponse(...)` when user clicks Allow/Deny. `useChat.sendAutomaticallyWhen` auto-triggers a continuation when approval responses are present.

## 4) How errors are surfaced to users

## A) API/HTTP errors (before or outside streaming)

- Backend returns structured `ChatSDKError` JSON.
- Frontend `onError` receives the message and displays:
  - toast notifications,
  - persistent chat issue banner.
- Special case: AI Gateway activation error opens dedicated activation dialog.

## B) In-stream model/tool failures

When `toUIMessageStream({ onError })` catches errors:

- Standard mode emits friendly retry guidance via `buildStreamErrorMessage`.
- Finance mode emits deterministic fallback summary via `buildFinanceFallbackMessage`.

These messages appear in the assistant stream so users still get context/action.

## C) Global stream container failure

If the outer stream fails, `createUIMessageStream(... onError)` returns a generic fallback: `"Oops, an error occurred!"`.

## 5) How retries work

Users retry from the message banner (“Retry response”).

### Retry algorithm

1. Frontend calls `getRetryableChatHistory(messages)`.
2. If last assistant message is incomplete/transient/tool-partial, it is considered recoverable.
3. If needed, frontend deletes trailing assistant fragment via `deleteTrailingMessages(...)` server action.
4. Frontend sends continuation with cleaned `messages` array.
5. Backend treats it as a continuation flow (`messages` branch), re-enters `streamText`, and persists finished output on `onFinish`.

### What is considered retryable

`getRetryableChatHistory` marks retryable states including:

- assistant messages still `streaming`,
- assistant messages with only transient parts (`step-start`, `data-*`),
- incomplete tool-call assistant messages.

It excludes unresolved approval-request states that need explicit user decision.

## 6) Persistence during and after loop

- Incoming user message is saved immediately.
- Assistant/tool outputs are finalized in `onFinish`:
  - updates existing partial messages,
  - inserts new finished messages.

This split is why retry can safely trim and replay only unstable assistant tails while preserving confirmed prior turns.
