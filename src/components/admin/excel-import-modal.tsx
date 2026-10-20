"use client";

import { useEffect, useRef, useState, useId } from "react";
import * as XLSX from "xlsx";

export interface ExcelOptionItem {
  label: string;
  image?: string;
}

export interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentOptionsCount: number;
  onImport: (options: ExcelOptionItem[], mode: "replace" | "append") => void;
  maxTotalAllowed?: number;
}

const MAX_OPTIONS = 30;

export function ExcelImportModal({
  isOpen,
  onClose,
  currentOptionsCount,
  onImport,
  maxTotalAllowed = MAX_OPTIONS,
}: ExcelImportModalProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsedOptions, setParsedOptions] = useState<ExcelOptionItem[]>([]);
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [truncateToLimit, setTruncateToLimit] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // 初始化重置
  useEffect(() => {
    if (isOpen) {
      setFileName("");
      setParsedOptions([]);
      setParseError(null);
      setImportMode(currentOptionsCount > 0 ? "append" : "replace");
      setTruncateToLimit(true);
    }
  }, [isOpen, currentOptionsCount]);

  // Esc 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 下载标准模板
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ["选项名称 (必填)", "图片链接 (选填)"],
      ["候选选项 1", ""],
      ["候选选项 2", ""],
      ["候选选项 3", ""],
      ["候选选项 4", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 25 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, "投票选项");
    XLSX.writeFile(wb, "投票选项导入模板.xlsx");
  };

  // 判断是否为表头
  const isLikelyHeader = (firstCell: string) => {
    const lower = firstCell.toLowerCase().trim();
    return /^(选项|选项名称|选项标题|候选|候选人|候选项|项目|名称|标题|label|option|name|title)/i.test(
      lower
    );
  };

  // 解析 Excel/CSV 文件
  const processFile = async (file: File) => {
    setParseError(null);
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("工作簿中没有找到有效的工作表 (Sheet)");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        blankrows: false,
      });

      if (!rawRows || rawRows.length === 0) {
        throw new Error("表格中没有可读取的数据");
      }

      let startIndex = 0;
      const firstRow = rawRows[0];
      if (
        Array.isArray(firstRow) &&
        firstRow.length > 0 &&
        firstRow[0] != null &&
        isLikelyHeader(String(firstRow[0]))
      ) {
        startIndex = 1;
      }

      const extracted: ExcelOptionItem[] = [];
      for (let i = startIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        const rawLabel = row[0] != null ? String(row[0]).trim() : "";
        if (!rawLabel) continue;

        const rawImage = row[1] != null ? String(row[1]).trim() : "";
        extracted.push({
          label: rawLabel,
          image: rawImage || undefined,
        });
      }

      if (extracted.length === 0) {
        throw new Error("未能从表格中识别到有效选项名称，请检查第一列内容");
      }

      setParsedOptions(extracted);
    } catch (err: unknown) {
      setParsedOptions([]);
      setParseError(
        err instanceof Error ? err.message : "解析表格文件失败，请确保格式正确"
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 数量计算
  const availableSlots =
    importMode === "append"
      ? Math.max(0, maxTotalAllowed - currentOptionsCount)
      : maxTotalAllowed;

  const totalAfterImport =
    importMode === "append"
      ? currentOptionsCount + parsedOptions.length
      : parsedOptions.length;

  const willExceed = totalAfterImport > maxTotalAllowed;

  // 最终实际导入列表
  const optionsToImport =
    willExceed && truncateToLimit
      ? parsedOptions.slice(0, availableSlots)
      : parsedOptions;

  const canConfirm =
    parsedOptions.length > 0 &&
    (!willExceed || truncateToLimit) &&
    optionsToImport.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onImport(optionsToImport, importMode);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Excel 批量导入选项
              </h3>
              <p className="text-xs text-slate-400">
                支持 .xlsx / .xls / .csv 文件快速批量导入
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* 模板与提示栏 */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/50 p-3 text-xs text-slate-300">
            <div>
              <p className="font-medium text-slate-200">表格格式规范：</p>
              <p className="mt-0.5 text-slate-400">
                第 1 列为<span className="text-emerald-400 font-medium">选项名称</span>（必填），第 2 列为图片链接（选填）
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-700/80 px-2.5 py-1.5 font-medium text-emerald-300 transition-colors hover:bg-slate-700 hover:text-emerald-200"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              下载模板
            </button>
          </div>

          {/* 上传区域 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${isDragging
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-slate-700 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/60"
              }`}
          >
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-emerald-400">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-200">
              {fileName ? (
                <span className="text-emerald-400 font-semibold">{fileName}</span>
              ) : (
                "点击上传或将 Excel / CSV 文件拖拽至此"
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              支持 .xlsx、.xls、.csv 格式
            </p>
          </div>

          {/* 错误提示 */}
          {parseError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
              {parseError}
            </div>
          )}

          {/* 解析成功预览与选项配置 */}
          {parsedOptions.length > 0 && (
            <div className="space-y-3">
              {/* 导入模式与数量统计 */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs">
                  <span className="text-slate-400">表格识别到选项：</span>
                  <span className="font-semibold text-emerald-400">
                    {parsedOptions.length} 个
                  </span>
                  {currentOptionsCount > 0 && (
                    <span className="ml-2 text-slate-400">
                      （当前已有 {currentOptionsCount} 个）
                    </span>
                  )}
                </div>

                {currentOptionsCount > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                      <input
                        type="radio"
                        name="importMode"
                        value="append"
                        checked={importMode === "append"}
                        onChange={() => setImportMode("append")}
                        className="text-emerald-500 focus:ring-emerald-500"
                      />
                      追加到末尾
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-300 ml-2">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === "replace"}
                        onChange={() => setImportMode("replace")}
                        className="text-emerald-500 focus:ring-emerald-500"
                      />
                      覆盖现有选项
                    </label>
                  </div>
                )}
              </div>

              {/* 超出限制警示 */}
              {willExceed && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        ⚠️ 导入后选项总数将达 {totalAfterImport} 项（系统上限为 {maxTotalAllowed} 项）
                      </p>
                      <p className="mt-1 text-amber-400/80">
                        {importMode === "append"
                          ? `当前已占用 ${currentOptionsCount} 项，最多可追加 ${availableSlots} 项。`
                          : `系统最多保留前 ${maxTotalAllowed} 项。`}
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-amber-200">
                      <input
                        type="checkbox"
                        checked={truncateToLimit}
                        onChange={(e) => setTruncateToLimit(e.target.checked)}
                        className="rounded"
                      />
                      自动截取前 {availableSlots} 项
                    </label>
                  </div>
                </div>
              )}

              {/* 选项数据预览列表 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                  <span>选项预览清单（共 {optionsToImport.length} 项将导入）：</span>
                  {willExceed && truncateToLimit && (
                    <span className="text-amber-400">
                      已自动截断后续 {parsedOptions.length - optionsToImport.length} 项
                    </span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2 space-y-1.5">
                  {optionsToImport.map((opt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800 text-[11px] text-slate-400">
                          {idx + 1}
                        </span>
                        <span className="truncate font-medium">{opt.label}</span>
                      </div>
                      {opt.image && (
                        <span
                          className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300 truncate max-w-[140px]"
                          title={opt.image}
                        >
                          含图片
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            确认导入 {optionsToImport.length > 0 ? `(${optionsToImport.length}项)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
