import { useState, useEffect } from "react";
import { PLATFORM_OS } from "@/lib/constants";
import { isTauri } from "@/lib/tauri";

export function usePlatform() {
  const [isMacOS, setIsMacOS] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const [isLinux, setIsLinux] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    import("@tauri-apps/plugin-os")
      .then(({ platform }) => {
        const currentPlatform = platform();
        setIsMacOS(currentPlatform === PLATFORM_OS.MACOS);
        setIsWindows(currentPlatform === PLATFORM_OS.WINDOWS);
        setIsLinux(currentPlatform === PLATFORM_OS.LINUX);
      })
      .catch(() => {
        // Not running in Tauri — leave all platform flags as false
      });
  }, []);

  return {
    isWindows,
    isMacOS,
    isLinux,
  };
}
