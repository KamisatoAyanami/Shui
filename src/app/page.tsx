"use client";

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

interface KnownDrink {
  id: number;
  name: string;
  amount_ml: number;
  icon_path: string | null;
  sort_order: number;
}

export default function Home() {
  const [drinks, setDrinks] = useState<KnownDrink[]>([]);
  const [gold, setGold] = useState(2000);
  const [todayTotal, setTodayTotal] = useState(0);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMl, setCustomMl] = useState("");

  const loadData = async () => {
    try {
      const [d, g, t] = await Promise.all([
        invoke<KnownDrink[]>("get_known_drinks"),
        invoke<number>("get_daily_goal"),
        invoke<number>("get_today_total"),
      ]);
      setDrinks(d);
      setGold(g);
      setTodayTotal(t);
    } catch {}
  };

  useEffect(() => {
    loadData();
  }, []);

  const recordDrink = async (name: string, ml: number) => {
    setTodayTotal((prev) => prev + ml);
    await invoke("add_record", { drinkName: name, amountMl: ml });
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
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">喝水小助手</h1>
          <p className="text-muted-foreground">保持健康饮水习惯</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-3">
            <span>今日已喝</span>
            <span>目标 {gold}ml</span>
          </div>
          <Progress value={progress} className="h-3 mb-2" />
          <p className="text-2xl font-bold text-center text-blue-600">
            {todayTotal}ml
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-600 mb-4">快捷记录</h2>
          <div className="grid grid-cols-4 gap-3">
            {drinks.map((drink) => (
              <DrinkButton
                key={drink.id}
                drink={drink}
                onClick={() => recordDrink(drink.name, drink.amount_ml)}
              />
            ))}
            <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
              <DialogTrigger asChild>
                <button className="group relative p-3 rounded-xl transition-all duration-300 cursor-pointer bg-gray-50 hover:bg-gray-100 hover:scale-105 active:scale-95 text-gray-500 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200">
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px]">自定义</span>
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
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h2 className="text-sm font-medium text-gray-600 mb-3">饮水小贴士</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            每天建议饮水1500~1700ml，约7~8杯。少量多次饮水，每次不超过200ml，呵护心肾健康。
          </p>
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
    if (drink.icon_path) {
      invoke<string>("get_drink_icon_abs_path", { filename: drink.icon_path })
        .then((absPath) => setIconUrl(convertFileSrc(absPath)))
        .catch(() => setIconUrl(null));
    }
  }, [drink.icon_path]);

  return (
    <button
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
      <span className="text-[10px] font-medium leading-tight text-center">{drink.name}</span>
      <span className="text-[9px] text-blue-500/80">{drink.amount_ml}ml</span>
    </button>
  );
}