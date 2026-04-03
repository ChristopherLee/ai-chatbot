"use client";

import {
  Bug,
  Copy,
  Database,
  RefreshCcw,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ChatStreamFailureLog } from "@/lib/ai/logging";
import type {
  ChatDebugModelMessage,
  ChatDebugPayload,
  ChatDebugUiMessage,
} from "@/lib/debug/chat-history";
import { fetcher } from "@/lib/utils";
import { toast } from "./toast";

type DebugView = "raw" | "sanitized" | "model" | "failures";

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function JsonBlock({ value }: { value: unknown }) {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value]);

  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-5">
      {formatted}
    </pre>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-medium text-sm">{value}</div>
    </div>
  );
}

function MessageCard({ message }: { message: ChatDebugUiMessage }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border px-2 py-0.5 font-medium text-xs">
          {message.role}
        </span>
        <span className="text-muted-foreground text-xs">{message.id}</span>
        <span className="text-muted-foreground text-xs">
          {message.createdAt ?? "No timestamp"}
        </span>
        <span className="ml-auto text-muted-foreground text-xs">
          {formatBytes(message.bytes)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {message.partStats.map((part) => (
          <div
            className="rounded-md border bg-muted/20 p-2 text-xs"
            key={`${message.id}-${part.index}`}
          >
            <div className="font-medium">
              Part {part.index}: {part.type}
            </div>
            <div className="mt-1 text-muted-foreground">
              state: {part.state ?? "n/a"}
            </div>
            <div className="text-muted-foreground">
              bytes: {formatBytes(part.bytes)}
            </div>
            <div className="text-muted-foreground">
              text: {formatBytes(part.textBytes)}, input:{" "}
              {formatBytes(part.inputBytes)}, output:{" "}
              {formatBytes(part.outputBytes)}
            </div>
          </div>
        ))}
      </div>

      <JsonBlock value={message.parts} />
    </div>
  );
}

function ModelMessageCard({ message }: { message: ChatDebugModelMessage }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full border px-2 py-0.5 font-medium text-xs">
          {message.role}
        </span>
        <span className="ml-auto text-muted-foreground text-xs">
          {formatBytes(message.bytes)}
        </span>
      </div>

      <JsonBlock value={message.content} />
    </div>
  );
}

function FailureCard({ failure }: { failure: ChatStreamFailureLog }) {
  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-red-300 px-2 py-0.5 font-medium text-xs text-red-900">
          {failure.scope}
        </span>
        <span className="text-muted-foreground text-xs">{failure.timestamp}</span>
        <span className="text-muted-foreground text-xs">
          {failure.selectedChatModel}
        </span>
      </div>

      <JsonBlock value={failure.error} />
    </div>
  );
}

export function ChatDebugPanel({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DebugView>("raw");
  const { data, error, isLoading, mutate } = useSWR<ChatDebugPayload>(
    open ? `/api/chat/${chatId}/debug` : null,
    fetcher
  );

  const activeData = useMemo(() => {
    if (!data) {
      return [];
    }

    if (view === "raw") {
      return data.rawUiMessages;
    }

    if (view === "sanitized") {
      return data.sanitizedUiMessages;
    }

    if (view === "failures") {
      return data.streamFailures;
    }

    return data.modelMessages;
  }, [data, view]);

  const copyActiveView = async () => {
    if (!data) {
      return;
    }

    const payload =
      view === "failures"
        ? data.streamFailures
        : view === "model"
        ? data.modelMessages
        : view === "sanitized"
          ? data.sanitizedUiMessages
          : data.rawUiMessages;

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast({
        type: "success",
        description: "Copied debug history JSON to clipboard.",
      });
    } catch {
      toast({
        type: "error",
        description: "Copy failed. Open the JSON in the panel and copy it manually.",
      });
    }
  };

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className="order-3 h-8 px-2 md:h-fit" variant="outline">
          <Bug />
          <span className="hidden md:inline">Debug History</span>
          <span className="md:sr-only">Debug History</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-4xl" side="right">
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle>Chat Debug History</SheetTitle>
          <SheetDescription>
            Inspect saved message parts, replayed model inputs, and full stream
            failure details for this chat.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 border-b px-6 py-3">
          <Button
            onClick={() => mutate()}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <RefreshCcw />
            <span className="sr-only">Refresh debug history</span>
          </Button>
          <Button onClick={() => void copyActiveView()} type="button" variant="outline">
            <Copy />
            Copy Current View
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={() => setView("raw")}
              type="button"
              variant={view === "raw" ? "default" : "outline"}
            >
              <Database />
              Persisted
            </Button>
            <Button
              onClick={() => setView("sanitized")}
              type="button"
              variant={view === "sanitized" ? "default" : "outline"}
            >
              <WandSparkles />
              Sanitized
            </Button>
            <Button
              onClick={() => setView("model")}
              type="button"
              variant={view === "model" ? "default" : "outline"}
            >
              Model Replay
            </Button>
            <Button
              onClick={() => setView("failures")}
              type="button"
              variant={view === "failures" ? "default" : "outline"}
            >
              <TriangleAlert />
              Failures
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-10rem)]">
          <div className="space-y-6 px-6 py-5">
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
                {error.message}
              </div>
            ) : isLoading && !data ? (
              <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                Loading debug history...
              </div>
            ) : data ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryCard label="Chat ID" value={data.chat.id} />
                  <SummaryCard label="Project ID" value={data.chat.projectId} />
                  <SummaryCard
                    label="Persisted Messages"
                    value={data.totals.persistedMessageCount}
                  />
                  <SummaryCard
                    label="Raw UI Size"
                    value={formatBytes(data.totals.rawUiBytes)}
                  />
                  <SummaryCard
                    label="Sanitized Size"
                    value={formatBytes(data.totals.sanitizedUiBytes)}
                  />
                  <SummaryCard
                    label="Model Replay Size"
                    value={formatBytes(data.totals.modelBytes)}
                  />
                  <SummaryCard
                    label="Tool Results Replayed"
                    value={data.totals.toolResultCount}
                  />
                  <SummaryCard
                    label="Logged Failures"
                    value={data.totals.loggedFailureCount}
                  />
                  <SummaryCard
                    label="Stream IDs"
                    value={data.streamIds.length}
                  />
                  <SummaryCard label="Title" value={data.chat.title} />
                </div>

                {data.streamIds.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-sm">Saved stream IDs</div>
                    <JsonBlock value={data.streamIds} />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="font-medium text-sm">
                    {view === "raw"
                      ? "Persisted message history"
                      : view === "sanitized"
                        ? "Sanitized UI message history"
                        : view === "failures"
                          ? "Logged stream failures"
                          : "Model replay history"}
                  </div>

                  {activeData.length === 0 ? (
                    <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                      {view === "failures"
                        ? "No stream failures have been logged for this chat in the current dev session."
                        : "No messages available for this view."}
                    </div>
                  ) : view === "failures" ? (
                    (activeData as ChatStreamFailureLog[]).map((failure, index) => (
                      <FailureCard
                        key={`${failure.timestamp}-${failure.scope}-${index}`}
                        failure={failure}
                      />
                    ))
                  ) : view === "model" ? (
                    (activeData as ChatDebugModelMessage[]).map(
                      (message, index) => (
                        <ModelMessageCard
                          key={`${message.role}-${index}`}
                          message={message}
                        />
                      )
                    )
                  ) : (
                    (activeData as ChatDebugUiMessage[]).map((message) => (
                      <MessageCard key={message.id} message={message} />
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
