"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PollMeta } from "@/lib/types";
import {
  ExcelImportModal,
  type ExcelOptionItem,
} from "@/components/admin/excel-import-modal";

interface OptionDraft {
  label: string;
  image: string;
}

async function uploadImage(file: File, type: "option" | "bg" = "option"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "上传失败");
  return data.url as string;
}

export default function CreatePollPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([
    { label: "", image: "" },
    { label: "", image: "" },
  ]);
  const [bgImage, setBgImage] = useState("");
  const [maxChoices, setMaxChoices] = useState(1);
  const [minChoices, setMinChoices] = useState(1);
  const [expireLocal, setExpireLocal] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const filledCount = options.filter((o) => o.label.trim()).length;

  const setOption = (i: number, patch: Partial<OptionDraft>) =>
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const addOption = () => {
    if (options.length < 20)
      setOptions((prev) => [...prev, { label: "", image: "" }]);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, j) => j !== i));
  };

  const handleExcelImport = (
    imported: ExcelOptionItem[],
    mode: "replace" | "append"
  ) => {
    setError("");
    const mapped = imported.map((item) => ({
      label: item.label,
      image: item.image || "",
    }));

    let nextOptions: OptionDraft[];
    if (mode === "append") {
      const existingActive = options.filter((o) => o.label.trim() || o.image.trim());
      nextOptions = [...existingActive, ...mapped].slice(0, 20);
    } else {
      nextOptions = mapped.slice(0, 20);
    }

    while (nextOptions.length < 2) {
      nextOptions.push({ label: "", image: "" });
    }

    setOptions(nextOptions);

    const nextFilled = nextOptions.filter((o) => o.label.trim()).length;
    if (nextFilled > 0 && maxChoices > nextFilled) {
      setMaxChoices(nextFilled);
    }
  };

  const submit = async () => {
    setError("");
    if (!title.trim()) return setError("请填写投票主题");
    if (filledCount < 2) return setError("至少需要 2 个候选选项");
    if (minChoices > maxChoices) return setError("最少可选不能大于最多可选");
    if (maxChoices > filledCount) return setError("最多可选不能大于选项数");

    const expireAt = expireLocal ? new Date(expireLocal).getTime() : 0;
    if (expireLocal && Number.isNaN(expireAt)) return setError("截止时间无效");

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          desc,
          options: options
            .map((o) => ({ label: o.label.trim(), image: o.image || undefined }))
            .filter((o) => o.label),
          max_choices: maxChoices,
          min_choices: minChoices,
          expire_at: expireAt,
          bg_image: bgImage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "创建失败");
        return;
      }
      router.push(`/admin/poll/${(data.poll as PollMeta).poll_id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold">创建投票</h1>

      <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">投票主题 *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：年度最佳团队评选"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">说明</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder="补充说明（可选）"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium">候选选项 *（{filledCount} 个）</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                Excel 导入
              </button>
              <button
                type="button"
                onClick={addOption}
                disabled={options.length >= 20}
                className="text-sm text-blue-400 hover:text-blue-300 disabled:text-slate-600"
              >
                + 添加选项
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-sm text-slate-400">
                  {i + 1}
                </span>
                {opt.image ? (
                  <div className="relative h-10 w-10 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={opt.image}
                      alt=""
                      className="h-10 w-10 rounded-lg border border-slate-700 object-cover"
                    />
                    <button
                      onClick={() => setOption(i, { image: "" })}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white hover:bg-rose-400"
                      title="移除图片"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-600 text-slate-500 hover:border-blue-500 hover:text-blue-400"
                    title="上传选项图片"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const url = await uploadImage(file);
                          setOption(i, { image: url });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "上传失败");
                        }
                      }}
                    />
                  </label>
                )}
                <input
                  value={opt.label}
                  onChange={(e) => setOption(i, { label: e.target.value })}
                  placeholder={`选项 ${i + 1}`}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => removeOption(i)}
                  disabled={options.length <= 2}
                  className="rounded-lg px-2 text-slate-500 hover:text-rose-400 disabled:opacity-30"
                  title="删除此选项"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">最少可选</label>
            <input
              type="number"
              min={1}
              max={Math.max(filledCount, 1)}
              value={minChoices}
              onChange={(e) => setMinChoices(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">最多可选</label>
            <input
              type="number"
              min={1}
              max={Math.max(filledCount, 1)}
              value={maxChoices}
              onChange={(e) => setMaxChoices(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-slate-500">
          最多选 1 项 = 单选；min ≤ max ≤ 选项数
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            截止时间（留空 = 手动结束）
          </label>
          <input
            type="datetime-local"
            value={expireLocal}
            onChange={(e) => setExpireLocal(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-blue-500 [color-scheme:dark]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            背景图片（可选，展示于投票页与大屏）
          </label>
          {bgImage ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bgImage}
                alt=""
                className="h-16 w-32 rounded-lg border border-slate-700 object-cover"
              />
              <button
                onClick={() => setBgImage("")}
                className="text-sm text-rose-400 hover:text-rose-300"
              >
                移除
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 py-4 text-sm text-slate-500 hover:border-blue-500 hover:text-blue-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              点击上传背景图（jpg/png/webp/gif，≤5MB）
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setBgImage(await uploadImage(file, "bg"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "上传失败");
                  }
                }}
              />
            </label>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? "创建中…" : "创建投票"}
        </button>
      </div>

      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentOptionsCount={filledCount}
        onImport={handleExcelImport}
      />
    </main>
  );
}
