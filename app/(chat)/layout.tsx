import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getLatestProjectByUserId } from "@/lib/db/queries";
import { auth } from "../(auth)/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <DataStreamProvider>
        <Suspense fallback={<div className="flex h-dvh" />}>
          <SidebarWrapper>{children}</SidebarWrapper>
        </Suspense>
      </DataStreamProvider>
    </>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";
  const currentProject = session?.user
    ? await getLatestProjectByUserId({ userId: session.user.id })
    : null;

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar
        currentProject={
          currentProject
            ? { id: currentProject.id, title: currentProject.title }
            : null
        }
        user={session?.user}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
