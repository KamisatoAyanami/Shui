"use client";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useTray } from "@/hooks/use-tray";
import { STORE_NAME } from "@/lib/constants";
import { usePlatform } from "@/hooks/use-platform";
import { getGeneralConfig } from "@/utils/store";
import { isTauri, safeInvoke } from "@/lib/tauri";

interface WeightInfo {
  weight: number | null;
  multiplier: number;
  goal_ml: number;
  source: string;
}

export default function Home() {
  const [config, setConfig] = useState({
    isAutoStart: false,
    isCountDown: false,
    isFullScreen: false,
  });
  const { isWindows } = usePlatform();
  useTray();

  const [weightInfo, setWeightInfo] = useState<WeightInfo | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [multiplier, setMultiplier] = useState(33);
  const [manualGoal, setManualGoal] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      let isAutoStart = false;
      if (isTauri()) {
        try {
          const { isEnabled } = await import("@tauri-apps/plugin-autostart");
          isAutoStart = await isEnabled();
        } catch { /* ignore */ }
      }

      const generalSetting = await getGeneralConfig();

      setConfig({
        ...config,
        isCountDown: generalSetting?.isCountDown || false,
        isFullScreen: generalSetting?.isFullScreen || false,
        isAutoStart,
      });
    }

    loadConfig();
    loadWeightInfo();
  }, []);

  const loadWeightInfo = async () => {
    try {
      const info = await safeInvoke<WeightInfo>("get_weight_info");
      if (info) {
        setWeightInfo(info);
        if (info.weight) setWeightInput(String(info.weight));
        setMultiplier(info.multiplier);
      }
    } catch {
    }
  };

  const saveConfig = async (field: string, checked: boolean) => {
    if (!isTauri()) {
      setConfig({ ...config, [field]: checked });
      return;
    }

    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load(STORE_NAME.config, { autoSave: false });
      const oldConfig = await store.get<{ value: number }>("general");

      setConfig({
        ...config,
        [field]: checked,
      });

      await store.set("general", {
        ...oldConfig,
        [field]: checked,
      });
      await store.save();
    } catch { /* ignore */ }
  };

  const handleAutoStartChange = async (checked: boolean) => {
    saveConfig("isAutoStart", checked);

    if (!isTauri()) return;
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (checked) {
        enable();
      } else {
        disable();
      }
    } catch { /* ignore */ }
  };

  const handleSetWeight = async () => {
    const w = parseFloat(weightInput);
    if (isNaN(w) || w <= 0) return;
    const goal = await safeInvoke<number>("set_weight", { weightKg: w });
    if (goal != null) {
      setWeightInfo({ weight: w, multiplier, goal_ml: goal, source: "auto" });
    }
  };

  const handleSetManualGoal = async () => {
    const g = parseInt(manualGoal);
    if (isNaN(g) || g <= 0) return;
    await safeInvoke("set_manual_goal", { goalMl: g });
    setWeightInfo((prev) => prev ? { ...prev, goal_ml: g, source: "manual" } : null);
    setShowGoalInput(false);
    setManualGoal("");
  };

  return (
    <div>
      <h3 className="mb-4 text-lg font-medium">通用</h3>

      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs mb-4">
        <div>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            开机自启动
          </label>
          <p className="text-[0.8rem] text-muted-foreground">
            电脑重启之后自动开始倒计时
          </p>
        </div>
        <Switch
          checked={config.isAutoStart}
          onCheckedChange={handleAutoStartChange}
        />
      </div>

      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs mb-4">
        <div>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            倒计时
          </label>
          <p className="text-[0.8rem] text-muted-foreground">
            开启后将在菜单栏显示倒计时，支持macOS和linux
          </p>
        </div>
        <Switch
          disabled={isWindows}
          checked={config.isCountDown}
          onCheckedChange={async (checked) => {
            await saveConfig("isCountDown", checked);
            safeInvoke("reset_timer");
          }}
        />
      </div>

      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs mb-4">
        <div>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            全屏提醒
          </label>
          <p className="text-[0.8rem] text-muted-foreground">
            开启后将以全屏方式显示提醒，关闭则使用系统通知
          </p>
        </div>
        <Switch
          checked={config.isFullScreen}
          onCheckedChange={async (checked) => {
            await saveConfig("isFullScreen", checked);
          }}
        />
      </div>

      <div className="rounded-lg border p-4 shadow-xs">
        <h4 className="text-sm font-medium mb-3">每日目标</h4>

        {weightInfo && (
          <div className="text-sm mb-3">
            <p>
              当前目标：
              <span className="font-medium">{weightInfo.goal_ml}ml</span>
              {weightInfo.source === "auto" && (
                <span className="text-muted-foreground ml-1">（根据体重自动计算）</span>
              )}
              {weightInfo.source === "manual" && (
                <span className="text-muted-foreground ml-1">（手动设置）</span>
              )}
              {weightInfo.source === "default" && (
                <span className="text-muted-foreground ml-1">（默认值）</span>
              )}
            </p>
          </div>
        )}

        <div className="flex items-end gap-3 mb-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">体重（kg）</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="输入体重"
                className="flex-1"
              />
              <Button onClick={handleSetWeight} size="sm">
                计算目标
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">计算系数</label>
          <div className="flex gap-2">
            {[30, 33, 35].map((v) => (
              <Button
                key={v}
                variant={multiplier === v ? "default" : "outline"}
                size="sm"
                onClick={() => setMultiplier(v)}
              >
                {v}ml/kg
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {multiplier === 30 ? "保守计算" : multiplier === 33 ? "适中计算（推荐）" : "积极计算"}
          </p>
        </div>

        <div className="pt-2 border-t">
          {showGoalInput ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">手动设置目标（ml）</label>
                <Input
                  type="number"
                  value={manualGoal}
                  onChange={(e) => setManualGoal(e.target.value)}
                  placeholder="例: 2500"
                />
              </div>
              <Button onClick={handleSetManualGoal} size="sm">确认</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowGoalInput(false)}>取消</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowGoalInput(true)}>
              手动设置目标
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            手动设置后将覆盖体重自动计算的结果
          </p>
        </div>
      </div>
    </div>
  );
}
