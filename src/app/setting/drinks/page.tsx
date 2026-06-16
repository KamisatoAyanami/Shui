"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ImageUp } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

interface KnownDrink {
  id: number;
  name: string;
  amount_ml: number;
  icon_path: string | null;
  sort_order: number;
}

export default function DrinksPage() {
  const [drinks, setDrinks] = useState<KnownDrink[]>([]);
  const [editDrink, setEditDrink] = useState<KnownDrink | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formMl, setFormMl] = useState("");
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [formIconPreview, setFormIconPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDrinks = async () => {
    const list = await invoke<KnownDrink[]>("get_known_drinks");
    setDrinks(list);
  };

  useEffect(() => {
    loadDrinks();
  }, []);

  const resetForm = () => {
    setEditDrink(null);
    setFormName("");
    setFormMl("");
    setSelectedImagePath(null);
    setFormIconPreview(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = async (drink: KnownDrink) => {
    setEditDrink(drink);
    setFormName(drink.name);
    setFormMl(String(drink.amount_ml));
    setSelectedImagePath(null);
    if (drink.icon_path) {
      try {
        const absPath = await invoke<string>("get_drink_icon_abs_path", { filename: drink.icon_path });
        setFormIconPreview(convertFileSrc(absPath));
      } catch {
        setFormIconPreview(null);
      }
    } else {
      setFormIconPreview(null);
    }
    setDialogOpen(true);
  };

  const handleSelectImage = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    }) as string | null;
    if (selected) {
      setSelectedImagePath(selected);
      setFormIconPreview(convertFileSrc(selected));
    }
  };

  const handleSave = async () => {
    const name = formName.trim();
    const ml = parseInt(formMl);
    if (!name || isNaN(ml) || ml <= 0) return;
    setSaving(true);

    try {
      if (editDrink) {
        await invoke("update_known_drink", { id: editDrink.id, name, amountMl: ml });
        if (selectedImagePath) {
          await invoke("save_drink_icon", { drinkId: editDrink.id, sourcePath: selectedImagePath });
        }
      } else {
        const newId = await invoke<number>("add_known_drink", { name, amountMl: ml });
        if (selectedImagePath) {
          await invoke("save_drink_icon", { drinkId: newId, sourcePath: selectedImagePath });
        }
      }
      setDialogOpen(false);
      loadDrinks();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (drink: KnownDrink) => {
    await invoke("delete_known_drink", { id: drink.id });
    loadDrinks();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">饮品管理</h3>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-1" />
              新增饮品
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editDrink ? "编辑饮品" : "新增饮品"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">名称</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例: 一杯水"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">容量 (ml)</label>
                <Input
                  type="number"
                  value={formMl}
                  onChange={(e) => setFormMl(e.target.value)}
                  placeholder="例: 250"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">图标</label>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={handleSelectImage} type="button">
                    <ImageUp className="w-4 h-4 mr-1" />
                    选择图片
                  </Button>
                  {formIconPreview ? (
                    <img src={formIconPreview} alt="预览" className="w-10 h-10 rounded object-cover border" />
                  ) : formName ? (
                    <div className="w-10 h-10 rounded bg-blue-100 flex items-center justify-center text-lg font-medium text-blue-600">
                      {formName.charAt(0)}
                    </div>
                  ) : null}
                </div>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>
                {saving ? "保存中..." : editDrink ? "保存修改" : "添加饮品"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {drinks.map((drink) => (
          <DrinkCard
            key={drink.id}
            drink={drink}
            onEdit={() => openEditDialog(drink)}
            onDelete={() => handleDelete(drink)}
          />
        ))}
      </div>
    </div>
  );
}

function DrinkCard({
  drink,
  onEdit,
  onDelete,
}: {
  drink: KnownDrink;
  onEdit: () => void;
  onDelete: () => void;
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
    <div className="group relative rounded-lg border p-4 hover:shadow-sm transition-shadow">
      <div className="flex flex-col items-center text-center gap-2">
        {iconUrl ? (
          <img src={iconUrl} alt={drink.name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-xl font-medium text-blue-600">
            {drink.name.charAt(0)}
          </div>
        )}
        <div>
          <p className="text-sm font-medium">{drink.name}</p>
          <p className="text-xs text-muted-foreground">{drink.amount_ml}ml</p>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}