# Backend Architecture Overview

This project runs frontend and backend in the same Next.js app. The backend for chat is implemented as App Router route handlers and shared server libraries.

## Core backend surfaces

- `app/(chat)/api/chat/route.ts`
  - `POST /api/chat` for message turns, continuations, tool approvals, and streaming responses.
  - `DELETE /api/chat?id=...` for deleting a chat.
- `app/(chat)/api/chat/schema.ts`
  - Zod contract for incoming chat requests.
- `lib/errors.ts`
  - Normalized `ChatSDKError` model and HTTP mapping.
- `lib/db/queries.ts`
  - Chat/project/message persistence helpers used by the route.

## Request validation and auth

`POST /api/chat` performs strict early checks:

1. Parse JSON request body.
2. Validate with `postRequestBodySchema` (chat id/model/visibility and either `message` or `messages`).
3. Resolve `auth()` session and reject unauthenticated requests.
4. Apply message entitlement/rate-limit checks (`getMessageCountByUserId` + `entitlementsByUserType`).

If any step fails, the route returns `ChatSDKError(...).toResponse()`.

## Chat and project bootstrapping

For first user messages:

- If no chat exists, the route:
  - validates or creates a `Project`,
  - creates the `Chat` row,
  - starts async title generation with `generateTitleFromUserMessage`.

For existing chats:

- Enforces owner checks (`chat.userId === session.user.id`).
- Loads DB history for normal user turns.
- Uses provided `messages` directly for approval/continuation flows.

## Message persistence model

Persistence happens in two phases:

1. **Immediate user-write:**
   - Incoming user message is stored before model generation.
2. **Post-stream writeback (`onFinish`):**
   - `planPersistableMessageWrites(...)` diffs existing vs finished messages.
   - Existing messages may be updated (`updateMessage`).
   - New assistant/tool messages are inserted (`saveMessages`).

This supports incremental streaming and keeps durable history consistent with what the UI saw.

## Runtime-mode split

The route chooses between:

- **Standard chat mode**
- **Finance chat mode** (if project has finance dataset)

The finance branch injects a finance-specific system prompt and tools (`getFinanceSnapshot`, `applyFinanceActions`, `queryFinanceTransactions`, etc.). The standard branch uses general tools (`getWeather`, document tools, suggestions).

## Streaming and resumability

- Streaming is built with `createUIMessageStream(...)` + `createUIMessageStreamResponse(...)`.
- `streamText(...)` powers the model/tool execution loop.
- If Redis is configured, resumable stream IDs are persisted and linked for reconnect support.

## Backend error strategy

### Typed API errors

Business/auth/validation errors return structured JSON with status codes via `ChatSDKError`:

- 400 bad request
- 401 unauthorized
- 403 forbidden
- 404 not found
- 429 rate limit
- 503 offline/unavailable

### Stream-time errors

During `result.toUIMessageStream`, `onError` maps failures to user-readable fallback messages:

- activation/credit issues
- key-limit issues
- timeout interruptions
- generic model failures

Finance mode additionally returns a deterministic finance snapshot summary fallback so users still get actionable output.

### Top-level catch

Unhandled errors in `POST /api/chat` are logged (with `x-vercel-id` when present) and returned as `offline:chat` unless a specific activation error is detected and translated to `bad_request:activate_gateway`.

## Delete behavior

`DELETE /api/chat?id=...` validates id + auth + chat ownership, then deletes the chat and returns JSON 200.
