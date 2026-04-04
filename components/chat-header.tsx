"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo } from "react";
import { useWindowSize } from "usehooks-ts";
import { ChatDebugPanel } from "@/components/chat-debug-panel";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon, VercelIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();
  const newChatHref = "/";
  const showDebugPanel = process.env.NODE_ENV === "development" && !isReadonly;

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-border/60 border-b bg-background/95 px-2 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-3 md:py-2">
      <SidebarToggle />
      <div className="flex-1" />

      {(!open || windowWidth < 768) && (
        <Button
          className="order-2 h-9 rounded-full px-2.5 md:order-1 md:h-8 md:rounded-md md:px-2"
          onClick={() => {
            router.push(newChatHref);
            router.refresh();
          }}
          variant="outline"
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      {showDebugPanel && <ChatDebugPanel chatId={chatId} />}

      <Button
        asChild
        className="order-3 hidden bg-zinc-900 px-2 text-zinc-50 hover:bg-zinc-800 md:ml-auto md:flex md:h-fit dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <Link
          href={"https://vercel.com/templates/next.js/nextjs-ai-chatbot"}
          rel="noreferrer"
          target="_noblank"
        >
          <VercelIcon size={16} />
          Deploy with Vercel
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
