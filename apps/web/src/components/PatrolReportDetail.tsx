import { useState } from "react";
import type { PatrolReport } from "@agri/shared";
import { api } from "../services/api";
import { PatrolEvidence } from "./PatrolEvidence";
import { useAssistant } from "../assistant/assistantContext";

export function PatrolReportDetail({
  report,
  onUpdated,
}: {
  report: PatrolReport;
  onUpdated?: () => void;
}) {
  const { patrol } = useAssistant();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState(false);
  const demo = report.demo;
  const done = resolved || demo?.review.status === "resolved";
  async function resolve() {
    if (!demo || !confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.reviewDemo(demo.runId);
      setResolved(true);
      onUpdated?.();
      if (patrol.run?.id === demo.runId) await patrol.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复核状态保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="patrol-report-detail">
      <p className="demo-notice">
        {demo?.notice ?? "原有巡田报告。请以报告中的能力和数据说明为准。"}
      </p>
      <p>{report.conclusion}</p>
      <p>{report.environmentRisk}</p>
      <small>
        报告编号：{report.id} · 保存于{" "}
        {new Date(report.createdAt).toLocaleString("zh-CN")}
      </small>
      {demo ? (
        <>
          <PatrolEvidence evidence={demo} />
          <section className="demo-proof">
            <h3>{demo.review.title}</h3>
            <ul>
              {demo.review.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {done ? (
              <p role="status">人工复核已标记完成（这不代表病害已确诊）。</p>
            ) : (
              <>
                <label className="demo-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  我已逐项完成人工复核；不是仅看完演示。
                </label>
                <button
                  className="secondary-button"
                  disabled={!confirmed || busy}
                  onClick={() => void resolve()}
                >
                  {busy ? "保存中…" : "标记复核完成"}
                </button>
                <small>仅报告所属账号可更新复核状态。</small>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        </>
      ) : (
        <>
          <ul>
            {report.anomalies.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{report.suggestion}</p>
        </>
      )}
    </div>
  );
}
