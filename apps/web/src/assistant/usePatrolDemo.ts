import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DemoCommand,
  DemoRun,
  DemoScenario,
  DemoScenarioId,
} from "@agri/shared";
import { api } from "../services/api";

export function usePatrolDemo() {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [run, setRun] = useState<DemoRun | null>(null);
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>("high-humidity");
  const [humidity, setHumidity] = useState(91);
  const [threshold, setThreshold] = useState(85);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const mounted = useRef(false);
  const operation = useRef(false);
  const version = useRef(0);
  const runRef = useRef<DemoRun | null>(null);
  const keyRef = useRef<string | null>(null);
  const requests = useRef(new Set<AbortController>());
  const apply = useCallback((next: DemoRun | null) => {
    runRef.current = next;
    setRun(next);
  }, []);
  const refresh = useCallback(async () => {
    const revision = ++version.current;
    const controller = new AbortController();
    requests.current.add(controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError("");
    try {
      const [list, latest] = await Promise.all([
        api.getDemoScenarios(controller.signal),
        api.getCurrentDemo(controller.signal),
      ]);
      if (!mounted.current || revision !== version.current) return;
      setScenarios(list);
      apply(latest);
    } catch (err) {
      if (mounted.current && revision === version.current)
        setError(err instanceof Error ? err.message : "巡田服务暂时不可用。");
    } finally {
      clearTimeout(timer);
      requests.current.delete(controller);
      if (mounted.current && revision === version.current) setLoading(false);
    }
  }, [apply]);
  const dispose = useCallback(() => {
    mounted.current = false;
    version.current++;
    for (const controller of requests.current) controller.abort();
    requests.current.clear();
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return dispose;
  }, [refresh, dispose]);

  const runId = run?.id;
  const runStatus = run?.status;
  useEffect(() => {
    if (!runId || runStatus !== "running") return;
    let controller: AbortController | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (operation.current) {
        timer = setTimeout(poll, 1000);
        return;
      }
      const revision = version.current;
      controller = new AbortController();
      const requestController = controller;
      const timeout = setTimeout(() => requestController.abort(), 10000);
      try {
        const next = await api.getDemoRun(runId, requestController.signal);
        if (stopped || !mounted.current || revision !== version.current) return;
        apply(next);
        setPollError("");
      } catch (err) {
        if (!stopped && mounted.current)
          setPollError(err instanceof Error ? err.message : "状态同步失败");
      } finally {
        clearTimeout(timeout);
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 500);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [runId, runStatus, apply]);

  const perform = useCallback(
    async (work: (signal: AbortSignal) => Promise<DemoRun>) => {
      if (operation.current) return;
      operation.current = true;
      ++version.current;
      setOperating(true);
      setError("");
      const controller = new AbortController();
      requests.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const next = await work(controller.signal);
        if (mounted.current) {
          apply(next);
          setPollError("");
        }
      } catch (err) {
        if (mounted.current)
          setError(
            err instanceof Error
              ? err.message
              : "操作未完成，请同步状态后重试。",
          );
      } finally {
        clearTimeout(timeout);
        requests.current.delete(controller);
        operation.current = false;
        if (mounted.current) setOperating(false);
      }
    },
    [apply],
  );
  const start = useCallback(async () => {
    if (
      runRef.current &&
      !["complete", "cancelled"].includes(runRef.current.status)
    )
      return;
    // Retain the same key when the response is lost: resending must not create a second job.
    keyRef.current ??= crypto.randomUUID();
    await perform((signal) =>
      api.startDemo(
        { scenarioId, humidity, threshold, requestKey: keyRef.current! },
        signal,
      ),
    );
  }, [perform, scenarioId, humidity, threshold]);
  const command = useCallback(
    async (command: DemoCommand) => {
      const current = runRef.current;
      if (current)
        await perform((signal) => api.commandDemo(current.id, command, signal));
    },
    [perform],
  );
  const reset = useCallback(() => {
    if (
      operation.current ||
      (runRef.current &&
        !["complete", "cancelled"].includes(runRef.current.status))
    )
      return;
    ++version.current;
    keyRef.current = null;
    apply(null);
    setScenarioId("high-humidity");
    setHumidity(91);
    setThreshold(85);
    setError("");
    setPollError("");
  }, [apply]);
  const completeReview = useCallback(async () => {
    const current = runRef.current;
    if (current) await perform((signal) => api.reviewDemo(current.id, signal));
  }, [perform]);
  const chooseScenario = (id: DemoScenarioId) => {
    if (runRef.current || operation.current) return;
    setScenarioId(id);
    setHumidity(
      scenarios.find((item) => item.id === id)?.humidity ??
        (id === "normal" ? 68 : 91),
    );
  };
  return {
    scenarios,
    run,
    scenarioId,
    chooseScenario,
    humidity,
    setHumidity,
    threshold,
    setThreshold,
    loading,
    operating,
    error,
    pollError,
    start,
    command,
    reset,
    refresh,
    completeReview,
  };
}
