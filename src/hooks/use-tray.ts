import { useCallback, useEffect } from "react";
import { TrayIcon } from "@tauri-apps/api/tray";
import {
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { platform } from "@tauri-apps/plugin-os";

const TRAY_ID = "main-tray";

export function useTray() {
  useEffect(() => {
    setMenu();
  }, []);

  const checkTauriAndInit = async () => {
    try {
      // Attempt to get Tauri version — if it fails, we're not in a Tauri environment
      await getVersion();
    } catch (e) {
      throw e;
    }
  };

  const getMenu = useCallback(async () => {
    const menu = await Menu.new();

    await menu.append(
      await MenuItem.new({
        text: "偏好设置",
        action: async () => {
          // Use Rust command for reliable window showing (handles macOS ActivationPolicy)
          await invoke("show_main_window");
        },
      })
    );
    await menu.append(await PredefinedMenuItem.new({ item: "Separator" }));
    await menu.append(
      await MenuItem.new({
        text: "立即休息",
        action: async () => {
          invoke("call_reminder");
        },
      })
    );

    // 创建子菜单
    const submenu = await Submenu.new({
      text: "计时控制",
      items: [
        {
          text: "暂停计时",
          action: async () => {
            invoke("pause_timer");
          },
        },
        {
          text: "重新计时",
          action: async () => {
            invoke("start_timer");
          },
        },
      ],
    });
    await menu.append(submenu);

    await menu.append(await PredefinedMenuItem.new({ item: "Separator" }));

    // 根据平台选择不同的退出菜单实现
    const currentPlatform = await platform();
    if (currentPlatform === "linux") {
      // Linux 系统使用普通的 MenuItem
      await menu.append(
        await MenuItem.new({
          text: "退出",
          action: async () => {
            invoke("quit");
          },
        })
      );
    } else {
      // 其他平台使用 PredefinedMenuItem
      await menu.append(
        await PredefinedMenuItem.new({ text: "退出", item: "Quit" })
      );
    }

    return menu;
  }, []);

  const setMenu = useCallback(async () => {
    let trayInstance: TrayIcon | null = null;

    try {
      await checkTauriAndInit();

      // Check for existing tray instance
      trayInstance = await TrayIcon.getById(TRAY_ID);

      trayInstance?.setMenu(await getMenu());
      // trayInstance?.setIconAsTemplate(true);
    } catch (error) {
      console.error("创建托盘失败:", error);
    }
  }, [getMenu]);
}
