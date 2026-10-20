"use client";

import { useState } from "react";
import type { AllowedAuthType } from "@/lib/types";

interface ClientGuardProps {
  allowedAuth: AllowedAuthType;
}

export function VoteGuard({ allowedAuth }: ClientGuardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const input = document.createElement("input");
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      alert("复制失败，请长按浏览器地址栏复制网址");
    }
  };

  const getContent = () => {
    if (allowedAuth === "dingtalk") {
      return {
        title: "请使用钉钉扫码投票",
        iconBg: "bg-sky-500/10 text-sky-400 ring-sky-500/30",
        desc: (
          <>
            本次投票已设定为
            <span className="font-semibold text-sky-400">仅限钉钉参与</span>
            ，请使用
            <span className="font-semibold text-sky-400">钉钉 App 重新扫码</span>
            进入。
          </>
        ),
      };
    }

    if (allowedAuth === "wecom") {
      return {
        title: "请使用企业微信扫码投票",
        iconBg: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
        desc: (
          <>
            本次投票已设定为
            <span className="font-semibold text-emerald-400">仅限企业微信参与</span>
            ，请使用
            <span className="font-semibold text-emerald-400">企业微信 App 重新扫码</span>
            进入。
          </>
        ),
      };
    }

    return {
      title: "请使用钉钉或企业微信扫码",
      iconBg: "bg-blue-500/10 text-blue-400 ring-blue-500/30",
      desc: (
        <>
          本次投票已设定为
          <span className="font-semibold text-sky-400">仅限钉钉</span> 或
          <span className="font-semibold text-emerald-400"> 企业微信</span>
          参与，请使用对应 App 重新扫码进入。
        </>
      ),
    };
  };

  const { title, iconBg, desc } = getContent();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 py-10 text-center text-slate-100">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900/90 p-8 shadow-2xl ring-1 ring-slate-800">
        {/* 提示图标 */}
        <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ring-1 ${iconBg}`}>
          <svg
            className="h-10 w-10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-white">
          {title}
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          {desc}
        </p>

        {/* <div className="mt-6">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex w-full items-center justify-center rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 active:scale-[0.98] cursor-pointer"
          >
            {copied ? "已复制投票链接 ✓" : "复制投票链接"}
          </button>
        </div> */}
      </div>
    </main>
  );
}
