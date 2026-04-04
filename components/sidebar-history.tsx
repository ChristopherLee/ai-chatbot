"use client";

import { motion } from "framer-motion";
import {
  BookOpenText,
  LayoutDashboard,
  ReceiptText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { createChatHistoryPaginationKey } from "@/lib/chat-history";
import type { ChatWithProject } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";

export type ChatHistory = {
  chats: ChatWithProject[];
  hasMore: boolean;
};

export function SidebarHistory({
  user,
  currentProject,
}: {
  user: User | undefined;
  currentProject: { id: string; title: string } | null;
}) {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeChatId = pathname?.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null;
  const activeProjectId = pathname?.startsWith("/project/")
    ? pathname.split("/")[2]
    : null;
  const activeProjectRoute = pathname?.startsWith("/project/")
    ? (pathname.split("/")[3] ?? null)
    : null;
  const selectedProjectId = activeProjectId ?? currentProject?.id ?? null;
  const historyPaginationKey = useMemo(
    () => createChatHistoryPaginationKey(selectedProjectId),
    [selectedProjectId]
  );

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(historyPaginationKey, fetcher, {
    fallbackData: [],
  });

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;
  const hasEmptyChatHistory =
    !isLoading && paginatedChatHistories
      ? paginatedChatHistories.every((page) => page.chats.length === 0)
      : false;
  const chatsFromHistory =
    paginatedChatHistories?.flatMap((page) => page.chats) ?? [];
  const showInitialLoading = isLoading && chatsFromHistory.length === 0;
  const activeChat = activeChatId
    ? (chatsFromHistory.find((chat) => chat.id === activeChatId) ?? null)
    : null;
  const resolvedProjectId =
    selectedProjectId ??
    chatsFromHistory[0]?.projectId ??
    activeChat?.projectId ??
    null;
  const rulesChatId =
    (activeChat?.projectId === resolvedProjectId ? activeChat.id : null) ??
    (resolvedProjectId
      ? (chatsFromHistory.find((chat) => chat.projectId === resolvedProjectId)
          ?.id ?? null)
      : null);
  const isRulesView =
    pathname?.startsWith("/chat/") === true &&
    searchParams.get("view") === "rules" &&
    activeChat?.projectId === resolvedProjectId;

  const handleDelete = () => {
    const chatToDelete = deleteId;

    if (!chatToDelete) {
      return;
    }

    const isCurrentChat = pathname === `/chat/${chatToDelete}`;

    setShowDeleteDialog(false);

    const deletePromise = fetch(`/api/chat?id=${chatToDelete}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting chat...",
      success: () => {
        mutate((chatHistories) => {
          if (chatHistories) {
            return chatHistories.map((chatHistory) => ({
              ...chatHistory,
              chats: chatHistory.chats.filter(
                (chat) => chat.id !== chatToDelete
              ),
            }));
          }
        });

        if (isCurrentChat) {
          router.replace("/");
          router.refresh();
        }

        return "Chat deleted successfully";
      },
      error: "Failed to delete chat",
    });
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Login to save and revisit previous chats!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          {resolvedProjectId ? (
            <div className="mb-4">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      activeProjectId === resolvedProjectId &&
                      activeProjectRoute === "dashboard"
                    }
                  >
                    <Link
                      href={`/project/${resolvedProjectId}/dashboard`}
                      onClick={() => setOpenMobile(false)}
                    >
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      activeProjectId === resolvedProjectId &&
                      activeProjectRoute === "transactions"
                    }
                  >
                    <Link
                      href={`/project/${resolvedProjectId}/transactions`}
                      onClick={() => setOpenMobile(false)}
                    >
                      <ReceiptText />
                      <span>Transactions</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      activeProjectId === resolvedProjectId &&
                      activeProjectRoute === "budget"
                    }
                  >
                    <Link
                      href={`/project/${resolvedProjectId}/budget`}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Wallet />
                      <span>Budget</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {rulesChatId ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isRulesView}>
                      <Link
                        href={`/chat/${rulesChatId}?view=rules`}
                        onClick={() => setOpenMobile(false)}
                      >
                        <BookOpenText />
                        <span>Categorization Rules</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </div>
          ) : null}

          {showInitialLoading ? (
            <>
              <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                Chats
              </div>
              <div className="flex flex-col">
                {[44, 32, 28, 64, 52].map((item) => (
                  <div
                    className="flex h-8 items-center gap-2 rounded-md px-2"
                    key={item}
                  >
                    <div
                      className="h-4 max-w-(--skeleton-width) flex-1 rounded-md bg-sidebar-accent-foreground/10"
                      style={
                        {
                          "--skeleton-width": `${item}%`,
                        } as CSSProperties
                      }
                    />
                  </div>
                ))}
              </div>
            </>
          ) : hasEmptyChatHistory ? (
            <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
              Your chats will appear here once you start chatting!
            </div>
          ) : (
            <>
              <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                Chats
              </div>
              <SidebarMenu>
                {chatsFromHistory.map((chat) => (
                  <ChatItem
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    key={chat.id}
                    onDelete={(chatId) => {
                      setDeleteId(chatId);
                      setShowDeleteDialog(true);
                    }}
                    setOpenMobile={setOpenMobile}
                  />
                ))}
              </SidebarMenu>

              <motion.div
                onViewportEnter={() => {
                  if (!isValidating && !hasReachedEnd) {
                    setSize((size) => size + 1);
                  }
                }}
              />

              {hasReachedEnd ? (
                <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
                  You have reached the end of your chat history.
                </div>
              ) : (
                <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
                  <div className="animate-spin">
                    <LoaderIcon />
                  </div>
                  <div>Loading Chats...</div>
                </div>
              )}
            </>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
