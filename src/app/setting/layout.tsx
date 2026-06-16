"use client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { usePlatform } from "@/hooks/use-platform";
import { sendReminderNotification } from "@/utils/notification";
import { getGeneralConfig } from "@/utils/store";
import { safeListen, safeInvoke } from "@/lib/tauri";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isMacOS } = usePlatform();

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    safeListen("timer-complete", async (event) => {
      if ((await getGeneralConfig()).isFullScreen) {
        safeInvoke("call_reminder");
      } else {
        sendReminderNotification();
        safeInvoke("reset_timer");
      }
    }).then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      unlistenFn?.();
    };
  }, []);

  return (
    <SidebarProvider
      open
      defaultOpen
      className="h-screen overflow-hidden"
      onContextMenu={(e) => {
        if (process.env.NODE_ENV === "production") e.preventDefault();
      }}
    >
      {isMacOS && (
        <div
          data-tauri-drag-region
          className="absolute top-0 left-0 right-0 h-8"
        />
      )}
      <AppSidebar />
      <main className="flex-1 p-10 pt-8 overflow-y-auto">{children}</main>
      <Toaster />
    </SidebarProvider>
  );
}
