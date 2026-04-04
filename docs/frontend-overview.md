# Frontend Architecture Overview

This document explains how the web client is organized, how chat state flows through the UI, and how user-facing failures are surfaced and recovered.

## Tech and structure at a glance

- The frontend is a Next.js App Router client with React components under `components/`.
- Real-time chat state is managed with `useChat` from `@ai-sdk/react` in `components/chat.tsx`.
- The chat timeline is rendered by `components/messages.tsx` and per-message rendering logic in `components/message.tsx`.
- App-level transport payload shaping lives in `lib/ai/chat-request.ts`.
- Retry and tool-approval history handling lives in `lib/ai/message-history.ts`.

## Chat shell responsibilities

`components/chat.tsx` is the coordinator for the interactive chat screen:

1. Initializes `useChat` with initial history from server-rendered data.
2. Configures transport to `POST /api/chat` via `DefaultChatTransport`.
3. Builds request payloads with `buildChatTransportBody` so requests are either:
   - **new user message** (`message`) or
   - **continuation/retry/tool-approval flow** (`messages`).
4. Tracks UI error state (`requestErrorMessage`) and shows error toast/banner behavior.
5. Implements retry (`retryIncompleteResponse`) that trims broken assistant tails and re-sends safe history.

## Message lifecycle in the UI

### 1) User sends input

- `MultimodalInput` calls `sendMessageWithAutoDenyPendingToolApprovals`.
- Before sending a new message, pending approval prompts are auto-denied so the next turn is unblocked (`autoDenyPendingToolApprovals`).

### 2) Transport body is assembled

`buildChatTransportBody` chooses request shape:

- For normal user turns, it sends only the latest `message`.
- For retries, tool approvals, or continuations, it sends `messages` (full or explicit continuation set).

This is important because the backend treats these paths differently for persistence and model input reconstruction.

### 3) Streaming response updates UI

- `onData` processes custom stream parts like `data-chat-title`.
- `onFinish` clears local error state and revalidates chat history/dashboard SWR keys.
- `Messages` renders assistant/user parts, tool calls, reasoning, and status indicators.

## How frontend errors are surfaced

### Request/transport errors

- `onError` in `useChat` captures any thrown error.
- If the error is a `ChatSDKError`, its server-supplied message is displayed to the user.
- Generic errors are normalized by `getRequestErrorMessage`.
- The UI shows:
  - toast errors, and
  - a persistent in-thread banner with retry guidance (`data-testid="chat-issue-banner"`).

### Special activation case

- If error text indicates AI Gateway card activation is required, `Chat` opens a dedicated `AlertDialog` with an activate link.

### Mid-stream interruption state

`Messages` computes `canRetryResponse` via `getRetryableChatHistory` and shows a warning banner even when global status returns to `ready`, if the last assistant message is partial/incomplete.

## How frontend retry works

`retryIncompleteResponse` in `components/chat.tsx`:

1. Calls `getRetryableChatHistory(messages)`.
2. If the last assistant message is recoverably incomplete, obtains `trailingMessageIdToDelete`.
3. Calls server action `deleteTrailingMessages` for that assistant fragment.
4. Replaces local message state with trimmed history.
5. Re-sends a continuation request with `{ body: { messages: retryableHistory.messages } }`.

This keeps client/server message history aligned before generating a continuation response.

## Tool approval loops on the frontend

- Tool approval parts are rendered with explicit **Allow/Deny** buttons in `components/message.tsx`.
- Clicking either sends `addToolApprovalResponse({ id, approved, reason? })`.
- `useChat.sendAutomaticallyWhen` in `Chat` detects approval responses and auto-continues without requiring extra user typing.

That behavior is part of the broader "agent loop" documented in `docs/chat-api-agent-loop.md`.
