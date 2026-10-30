import { useState } from "react";
import type { PatrolReport } from "@agri/shared";
import { ClipboardCheck } from "lucide-react";
import { api } from "../services/api";
import { PatrolDemoPanel } from "../components/PatrolDemoPanel";
import { PatrolReportDetail } from "../components/PatrolReportDetail";

export function PatrolPage() {
  const [report, setReport] = useState<PatrolReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData(event.currentTarget);
      const nextReport = await api.createPatrol(formData);
      setReport(nextReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "巡田报告生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>温室巡田测控 · 自主巡检</span>
          </div>
          <h1>AI巡田</h1>
        </div>
      </div>

      <PatrolDemoPanel />
      <details className="manual-patrol">
        <summary>手动上传巡检样本（历史备用通道）</summary>
        <p className="demo-notice">
          此入口保留旧功能，不参与自主仿真流程；上传图片不会触发新场景预设结果。实际视觉推理将在后续阶段统一接入。
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="two-column">
          <form className="form-panel" onSubmit={handleSubmit}>
            <label>
              地块名称
              <input name="plotName" placeholder="例如：1号玉米示范田" />
            </label>
            <label>
              作物名称
              <input name="cropName" placeholder="例如：玉米" />
            </label>
            <label>
              上传巡田图片
              <input name="image" type="file" accept="image/*" />
            </label>
            <button className="primary-button" disabled={loading}>
              <ClipboardCheck size={18} />
              {loading ? "生成中..." : "生成巡田报告"}
            </button>
          </form>

          <section className="result-panel">
            <h2>巡田报告</h2>
            {report ? (
              <PatrolReportDetail report={report} />
            ) : (
              <p className="muted">
                原有入口保存模拟巡田报告，不能作为图片识别或真实诊断依据。
              </p>
            )}
          </section>
        </div>
      </details>
    </section>
  );
}
