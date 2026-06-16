"use client";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Plus } from "lucide-react";
import "./index.css";
import { usePlatform } from "@/hooks/use-platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isTauri, safeListen, safeInvoke } from "@/lib/tauri";

interface KnownDrink {
  id: number;
  name: string;
  amount_ml: number;
  icon_path: string | null;
  sort_order: number;
}

async function hideWindowAction() {
  safeInvoke("hide_reminder_windows");
  safeInvoke("reset_timer");
  // Only unregister shortcuts when running in Tauri
  if (isTauri()) {
    try {
      const { unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
      unregisterAll();
    } catch { /* ignore */ }
  }
}

async function registerEscShortcut() {
  if (!isTauri()) return;
  try {
    const { isRegistered, register } = await import("@tauri-apps/plugin-global-shortcut");
    if (await isRegistered("Esc")) return;
    register("Esc", async () => {
      hideWindowAction();
    });
  } catch { /* ignore */ }
}

const playSound = () => {
  const audio = new Audio("/sounds/water-drop.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};

const reminderTexts = [
  "每天建议饮水1500~1700ml，约7~8杯，保持健康水分 💧",
  "建议少量多次饮水，每次不超过200ml，呵护心肾健康 ❤️",
  "观察尿液颜色：淡黄色最健康，深黄需补水，无色可能过量 🌟",
  "晨起来杯温水(200~300ml)，补充夜间水分，促进代谢 🌅",
  "餐前1小时喝水(100~150ml)，帮助消化，事半功倍 🍽️",
  "睡前1小时少量饮水(约100ml)，但别太多影响睡眠 😴",
  "运动后15分钟内补充200~300ml，平衡身体电解质 💪",
  "久坐办公记得每小时喝水100~150ml，保持清醒专注 💻",
  "喝35~40℃的水最好，太烫可能伤害身体，要适温 🌡️",
  "白开水和矿泉水是最佳选择，安全又健康 ✨",
  "不要用饮料代替水，果汁奶茶糖分高，咖啡浓茶会利尿 🥤",
  "饭中少喝水，可能影响消化，建议餐后半小时再补水 ⏰",
  "不要等到口渴才喝水，那时已经轻度脱水啦 💦",
  "水肿不是因为喝太多水，反而可能是喝得太少 💭",
  "高温天气补充淡盐水，平衡身体流失的钠钾 🌞",
  "乘坐飞机要多喝水，机舱很干燥，每小时喝100~150ml ✈️",
];

export default function ReminderPage() {
  const [drinks, setDrinks] = useState<KnownDrink[]>([]);
  const [reminderText, setReminderText] = useState("");
  const [gold, setGold] = useState(2000);
  const [todayTotal, setTodayTotal] = useState(0);
  const [countdown, setCountdown] = useState(30);
  const [monitorName, setMonitorName] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMl, setCustomMl] = useState("");
  const { isLinux } = usePlatform();

  const loadData = async () => {
    try {
      const [d, g, t] = await Promise.all([
        safeInvoke<KnownDrink[]>("get_known_drinks"),
        safeInvoke<number>("get_daily_goal"),
        safeInvoke<number>("get_today_total"),
      ]);
      if (d) setDrinks(d);
      if (g != null) setGold(g);
      if (t != null) setTodayTotal(t);
    } catch {
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setTimeout(
      () => {
        setReminderText(
          reminderTexts[Math.floor(Math.random() * reminderTexts.length)]
        );
      },
      reminderText ? 1000 : 0
    );
  }, [todayTotal]);

  useEffect(() => {
    const unlistenFns: Array<() => void> = [];

    registerEscShortcut();

    safeListen("countdown", (event) => {
      setCountdown(event.payload as number);
      if (event.payload === 0) {
        setTimeout(hideWindowAction, 500);
      }
    }).then((fn) => { unlistenFns.push(fn); });

    safeListen("reminder_already_hidden", () => {
      if (isTauri()) {
        import("@tauri-apps/plugin-global-shortcut").then(({ unregisterAll }) => {
          unregisterAll();
        }).catch(() => {});
      }
    }).then((fn) => { unlistenFns.push(fn); });

    safeListen("tauri://focus", () => {
      registerEscShortcut();
    }).then((fn) => { unlistenFns.push(fn); });

    if (isTauri()) {
      import("@tauri-apps/api/window").then(({ currentMonitor }) => {
        currentMonitor().then((mo) => {
          setMonitorName(mo?.name || "");
        }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      unlistenFns.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideWindowAction();
      }
    };

    if (isLinux) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (isLinux) {
        document.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [isLinux]);

  useEffect(() => {
    if (!monitorName) return;
    safeListen("tauri://move", async () => {
      if (!isTauri()) return;
      try {
        const { currentMonitor, getCurrentWindow } = await import("@tauri-apps/api/window");
        const mo = await currentMonitor();
        if (mo?.name !== monitorName) {
          const win = await getCurrentWindow();
          safeInvoke("hide_reminder_window", { label: win.label });
        }
      } catch { /* ignore */ }
    });
  }, [monitorName]);

  const recordDrink = async (name: string, ml: number) => {
    const newTotal = todayTotal + ml;
    setTodayTotal(newTotal);
    await safeInvoke("add_record", { drinkName: name, amountMl: ml });

    if (newTotal >= gold) {
      playSound();
    }

    setIsClosing(true);
    setTimeout(
      () => {
        hideWindowAction();
        setIsClosing(false);
      },
      isLinux ? 100 : 300
    );
  };

  const handleCustomRecord = async () => {
    const name = customName.trim() || "自定义饮品";
    const ml = parseInt(customMl);
    if (isNaN(ml) || ml <= 0) return;
    setCustomDialogOpen(false);
    setCustomName("");
    setCustomMl("");
    await recordDrink(name, ml);
  };

  const progress = Math.min((todayTotal / gold) * 100, 100);

  return (
    <div
      onContextMenu={(e) => {
        if (process.env.NODE_ENV === "production") e.preventDefault();
      }}
      className={`reminder-page min-h-screen flex items-center justify-center relative transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/30 backdrop-blur-sm px-4 py-2 rounded-full text-gray-700 text-base font-medium shadow-sm border border-white/20 transition-transform duration-300">
        {countdown}s 后自动关闭
      </div>
      <div
        className={`bg-white/30 backdrop-blur-sm p-8 rounded-2xl shadow-lg max-w-lg w-full z-10 border border-white/20 transition-all duration-100 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <h2 className="text-2xl font-bold text-center mb-6 text-blue-600">
          喝了么
        </h2>
        <p className="text-gray-600 text-center mb-8">{reminderText}</p>

        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>今日已喝: {todayTotal}ml</span>
            <span>目标: {gold}ml</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {drinks.map((drink) => (
            <DrinkButton
              key={drink.id}
              drink={drink}
              onClick={() => recordDrink(drink.name, drink.amount_ml)}
            />
          ))}
          <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
            <DialogTrigger asChild>
              <button
                tabIndex={-1}
                className="group relative p-4 rounded-xl transition-all duration-300 cursor-pointer bg-gray-50 hover:bg-gray-100 hover:scale-105 active:scale-95 text-gray-500 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200"
              >
                <Plus className="w-6 h-6" />
                <span className="text-xs">自定义</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>自定义记录</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">饮品名称</label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="例: 果汁"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">容量 (ml)</label>
                  <Input
                    type="number"
                    value={customMl}
                    onChange={(e) => setCustomMl(e.target.value)}
                    placeholder="例: 200"
                  />
                </div>
                <Button onClick={handleCustomRecord} className="w-full">
                  记录
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={hideWindowAction}
            tabIndex={-1}
            className="text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-1.5 transition-colors duration-300 cursor-pointer"
          >
            跳过
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DrinkButton({
  drink,
  onClick,
}: {
  drink: KnownDrink;
  onClick: () => void;
}) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    if (drink.icon_path && isTauri()) {
      Promise.all([
        safeInvoke<string>("get_drink_icon_abs_path", { filename: drink.icon_path }),
        import("@tauri-apps/api/core"),
      ])
        .then(([absPath, { convertFileSrc }]) => {
          if (absPath) setIconUrl(convertFileSrc(absPath));
        })
        .catch(() => setIconUrl(null));
    }
  }, [drink.icon_path]);

  return (
    <button
      tabIndex={-1}
      onClick={onClick}
      className="group relative p-3 rounded-xl transition-all duration-300 cursor-pointer bg-blue-50 hover:bg-blue-100 hover:scale-105 active:scale-95 text-blue-700 flex flex-col items-center justify-center gap-1"
    >
      {iconUrl ? (
        <img src={iconUrl} alt={drink.name} className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-blue-200/50 flex items-center justify-center text-sm font-medium text-blue-600">
          {drink.name.charAt(0)}
        </div>
      )}
      <span className="text-xs font-medium leading-tight text-center">{drink.name}</span>
      <span className="text-[10px] text-blue-500/80">{drink.amount_ml}ml</span>
    </button>
  );
}