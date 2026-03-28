"use client";

import { BookOpenText, MessageSquareText } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { FinanceSnapshot } from "@/lib/finance/types";
import { fetcher } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

function getFinanceSnapshotKey(
  pathname: string | null,
  projectId: string | null
) {
  if (pathname?.startsWith("/chat/")) {
    const chatId = pathname.split("/")[2];

    return chatId ? `/api/finance/chat/${chatId}` : null;
  }

  return projectId ? `/api/finance/project/${projectId}` : null;
}

export function SidebarFinanceRulesButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpenMobile } = useSidebar();

  const projectId = searchParams.get("projectId");
  const financeSnapshotKey = getFinanceSnapshotKey(pathname, projectId);
  const { data: snapshot, error } = useSWR<FinanceSnapshot>(
    financeSnapshotKey,
    fetcher
  );

  if (error || !snapshot) {
    return null;
  }

  const isRulesView = searchParams.get("view") === "rules";
  const label = isRulesView ? "Back to chat" : "Rules";
  const Icon = isRulesView ? MessageSquareText : BookOpenText;

  const handleClick = () => {
    if (!pathname) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (isRulesView) {
      params.delete("view");
    } else {
      params.set("view", "rules");
    }

    const query = params.toString();

    setOpenMobile(false);
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isRulesView}
          onClick={handleClick}
          tooltip={label}
          type="button"
          variant="outline"
        >
          <Icon />
          <span>{label}</span>
          {isRulesView ? null : (
            <span className="ml-auto text-sidebar-foreground/60 text-xs group-data-[collapsible=icon]:hidden">
              {snapshot.appliedOverrides.length}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
