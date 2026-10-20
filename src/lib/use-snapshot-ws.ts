"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "./types";

/**
 * WS 快照状态机：大屏与后台面板共用。
 * - join 后服务端立即推一次快照
 * - 断线指数退避重连（1s→2s→…→10s 封顶）
 * - REST 兜底轮询 + 5s 安全轮询防假连接
 */
export function useSnapshotWs(pollId: string): {
  snapshot: Snapshot | null;
  connected: boolean;
} {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    let lastMsgAt = 0;

    let everGotMessage = false;

    const fetchRest = async () => {
      try {
        const res = await fetch(`/api/screen/${pollId}`, { cache: "no-store" });
        if (res.ok) {
          const snap = (await res.json()) as Snapshot;
          setSnapshot(snap);
          lastMsgAt = Date.now();
          everGotMessage = true;
        }
      } catch {
        /* 忽略，等下轮 */
      }
    };

    // 挂载立即 REST 拉一次种子数据：WS 建连/服务端取快照前页面不空白
    void fetchRest();

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws?poll_id=${pollId}`);

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        lastMsgAt = Date.now();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "snapshot") {
            setSnapshot(msg.snapshot as Snapshot);
            lastMsgAt = Date.now();
            everGotMessage = true;
          }
        } catch {
          /* 忽略坏帧 */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        const delay = Math.min(1000 * 2 ** retry, 10000);
        retry += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    // REST 兜底：连接异常期间每 2s 拉一次
    fallbackTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) void fetchRest();
    }, 2000);

    // 假连接看门狗：仅在已收到过消息、连接看似打开但静默超 5s 时强制重连；
    // 从未收到消息说明服务端没有该房数据，交给 REST 兜底而不是反复断开
    watchdogTimer = setInterval(() => {
      if (
        everGotMessage &&
        ws &&
        ws.readyState === WebSocket.OPEN &&
        Date.now() - lastMsgAt > 5000
      ) {
        ws.close();
      }
    }, 5000);

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearInterval(fallbackTimer);
      clearInterval(watchdogTimer);
      ws?.close();
    };
  }, [pollId]);

  return { snapshot, connected };
}

/**
 * 倒计时：用快照的 server_ts 校准本地时钟偏差。
 */
export function useCountdown(expireAt: number, serverTs: number | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expireAt) {
      setRemaining(null);
      return;
    }
    // offset = 服务端时钟 - 本地时钟
    const offset = serverTs !== undefined ? serverTs - Date.now() : 0;
    const tick = () => setRemaining(Math.max(0, expireAt - (Date.now() + offset)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [expireAt, serverTs]);

  return remaining;
}
