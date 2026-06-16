"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DrinkRecord {
  id: number;
  drink_name: string;
  amount_ml: number;
  created_at: string;
}

interface DailyStat {
  date: string;
  total_ml: number;
  count: number;
}

interface ScheduleItem {
  time: string;
  label: string;
  ratio: number;
  amount_ml: number;
}

export default function StatsPage() {
  const [records, setRecords] = useState<DrinkRecord[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [goal, setGoal] = useState(2000);
  const [todayTotal, setTodayTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, s, sch, g, t] = await Promise.all([
        invoke<DrinkRecord[]>("get_today_records"),
        invoke<DailyStat[]>("get_recent_stats", { days: 7 }),
        invoke<ScheduleItem[]>("get_schedule"),
        invoke<number>("get_daily_goal"),
        invoke<number>("get_today_total"),
      ]);
      setRecords(r);
      setStats(s);
      setSchedule(sch);
      setGoal(g);
      setTodayTotal(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fmtTime = (dt: string) => {
    const parts = dt.split(" ");
    return parts.length > 1 ? parts[1].slice(0, 5) : dt;
  };

  const fmtDate = (d: string) => {
    return d.slice(5);
  };

  const pct = goal > 0 ? Math.min(todayTotal / goal, 1) : 0;

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">加载中...</div>;
  }

  return (
    <div className="space-y-8">
      <section>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">今日记录</h4>
        <div className="rounded-lg border p-4">
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">今天还没有喝水记录</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{fmtTime(r.created_at)}</span>
                  <span>{r.drink_name}</span>
                  <span className="font-medium">{r.amount_ml}ml</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">今日共饮</span>
              <span className="font-medium">
                {todayTotal}ml / {goal}ml
              </span>
            </div>
            <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right mt-1">{(pct * 100).toFixed(0)}%</p>
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">最近 7 天</h4>
        <div className="rounded-lg border p-4">
          {stats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {stats.map((s) => {
                const p = goal > 0 ? Math.min(s.total_ml / goal, 1) : 0;
                return (
                  <div key={s.date} className="flex items-center gap-2 text-sm">
                    <span className="w-28 text-muted-foreground shrink-0">
                      {fmtDate(s.date)} ({s.count}次)
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${p * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-medium shrink-0">{s.total_ml}ml</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
            每日目标：{goal}ml
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">
          黄金喝水时间表（目标 {goal}ml）
        </h4>
        <div className="rounded-lg border p-4">
          <div className="space-y-2">
            {schedule.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="w-12 font-medium">{item.time}</span>
                <span className="flex-1 text-muted-foreground px-2">{item.label}</span>
                <span className="w-16 text-right font-medium">{item.amount_ml}ml</span>
                <span className="w-10 text-right text-xs text-muted-foreground">
                  {(item.ratio * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
            <span className="text-muted-foreground">合计</span>
            <span className="font-medium">
              {schedule.reduce((sum, item) => sum + item.amount_ml, 0)}ml
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}