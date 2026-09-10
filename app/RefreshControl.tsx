"use client";

import { useCallback, useEffect, useState } from "react";

type RefreshRequest = {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  resultTradeDate: string | null;
  message: string | null;
};

type RefreshState = {
  authenticated: boolean;
  allowed: boolean;
  request: RefreshRequest | null;
};

export default function RefreshControl({ snapshotDate }: { snapshotDate: string }) {
  const [state, setState] = useState<RefreshState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/refresh?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("更新状态暂时不可用");
    const next = await response.json() as RefreshState;
    setState(next);
    if (next.request?.status === "completed" && next.request.resultTradeDate && next.request.resultTradeDate !== snapshotDate) {
      window.location.reload();
    }
  }, [snapshotDate]);

  useEffect(() => {
    let disposed = false;
    const poll = () => load().catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : "更新状态暂时不可用"); });
    poll();
    const timer = window.setInterval(poll, state?.request?.status === "pending" || state?.request?.status === "running" ? 8_000 : 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [load, state?.request?.status]);

  const requestRefresh = async () => {
    if (state && !state.authenticated) {
      window.location.href = "/signin-with-chatgpt?return_to=/";
      return;
    }
    if (state && !state.allowed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotDate }),
      });
      if (response.status === 401) {
        window.location.href = "/signin-with-chatgpt?return_to=/";
        return;
      }
      if (!response.ok) throw new Error(response.status === 403 ? "仅站点所有者可以更新" : "更新请求提交失败");
      const payload = await response.json();
      setState(current => ({ authenticated: true, allowed: true, request: payload.request || current?.request || null }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新请求提交失败");
    } finally {
      setBusy(false);
    }
  };

  const request = state?.request;
  const active = request?.status === "pending" || request?.status === "running";
  let label = "更新今日数据";
  if (!state) label = "检查更新";
  else if (!state.authenticated) label = "登录后更新";
  else if (!state.allowed) label = "仅本人可更新";
  else if (busy) label = "正在提交…";
  else if (request?.status === "pending") label = "等待自动更新";
  else if (request?.status === "running") label = "正在更新…";
  else if (request?.status === "failed") label = "重试更新";
  else if (request?.status === "completed" && request.resultTradeDate === snapshotDate) label = "检查今日更新";

  const title = error || request?.message || "从 iFinD 拉取、校验并发布最新交易日数据";
  return <button
    className={`refreshControl ${active ? "working" : ""} ${request?.status === "failed" ? "failed" : ""}`}
    type="button"
    onClick={requestRefresh}
    disabled={busy || active || Boolean(state?.authenticated && !state.allowed)}
    title={title}
    aria-label={`${label}。${title}`}
  >
    <span aria-hidden="true">↻</span>{label}
  </button>;
}
