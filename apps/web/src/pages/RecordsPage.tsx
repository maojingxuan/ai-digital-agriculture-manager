import { useEffect, useState } from "react";
import type { DiagnosisRecord, PatrolReport } from "@agri/shared";
import { api } from "../services/api";
import { PatrolReportDetail } from "../components/PatrolReportDetail";

export function RecordsPage() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisRecord[]>([]);
  const [patrols, setPatrols] = useState<PatrolReport[]>([]);
  const [error, setError] = useState("");
  const refreshPatrols = () => {
    void api
      .listPatrols()
      .then((items) => {
        setPatrols(items);
        setError("");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "报告读取失败"),
      );
  };

  useEffect(() => {
    api
      .listDiagnosis()
      .then(setDiagnosis)
      .catch(() => setDiagnosis([]));
    api
      .listPatrols()
      .then(setPatrols)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "报告读取失败"),
      );
  }, []);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="context-tag">
            <span className="live-indicator-dot" />
            <span>农事档案 · 巡检与问诊历史</span>
          </div>
          <h1>历史记录</h1>
        </div>
      </div>

      <div className="two-column">
        <section className="list-panel">
          <h2>问诊记录</h2>
          {diagnosis.length === 0 ? (
            <p className="muted">暂无问诊记录。</p>
          ) : (
            diagnosis.map((item) => (
              <article className="list-item" key={item.id}>
                <strong>
                  {item.cropType} · {item.suspectedDisease}
                </strong>
                <span>风险等级：{item.riskLevel}</span>
                <p>{item.suggestion}</p>
              </article>
            ))
          )}
        </section>

        <section className="list-panel">
          <h2>巡田报告</h2>
          <button className="secondary-button" onClick={refreshPatrols}>
            刷新巡田报告
          </button>
          {error && <p role="alert">{error}</p>}
          {patrols.length === 0 ? (
            <p className="muted">暂无巡田报告。</p>
          ) : (
            patrols.map((item) => (
              <article className="list-item" key={item.id}>
                <strong>
                  {item.plotName} · {item.cropName}
                </strong>
                <span>{item.growthStatus}</span>
                <p>{item.conclusion}</p>
                <details className="history-report">
                  <summary>
                    {item.demo ? "查看仿真证据与人工复核" : "查看完整报告"}
                  </summary>
                  <PatrolReportDetail
                    report={item}
                    onUpdated={refreshPatrols}
                  />
                </details>
              </article>
            ))
          )}
        </section>
      </div>
    </section>
  );
}
