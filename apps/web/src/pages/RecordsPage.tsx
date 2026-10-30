import { useEffect, useState } from "react";
import type { DiagnosisRecord, PatrolReport, RiskLevel } from "@agri/shared";
import { api } from "../services/api";
import { PatrolReportDetail } from "../components/PatrolReportDetail";

const RISK_LABEL: Record<RiskLevel, string> = {
  high: "高风险",
  medium: "中度风险",
  low: "低风险",
};

export function RecordsPage() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisRecord[]>([]);
  const [patrols, setPatrols] = useState<PatrolReport[]>([]);
  const [error, setError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<DiagnosisRecord | null>(
    null,
  );
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
        <section className="list-panel diag-panel">
          <h2>问诊记录</h2>
          {diagnosis.length === 0 ? (
            <p className="muted">暂无问诊记录。</p>
          ) : (
            <div className="history-scroll-box">
              {diagnosis.map((item) => (
                <article className="list-item diag-list-item" key={item.id}>
                  <div className="diag-item-main">
                    <strong>
                      {item.cropType} · {item.suspectedDisease}
                    </strong>
                    <span className={`risk-badge risk-${item.riskLevel}`}>
                      {RISK_LABEL[item.riskLevel]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelectedRecord(item)}
                  >
                    详细记录
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="list-panel patrol-panel">
          <h2>巡田报告</h2>
          <button className="secondary-button" onClick={refreshPatrols}>
            刷新巡田报告
          </button>
          {error && <p role="alert">{error}</p>}
          {patrols.length === 0 ? (
            <p className="muted">暂无巡田报告。</p>
          ) : (
            <div className="history-scroll-box">
              {patrols.map((item) => (
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
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedRecord && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="modal-container"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {selectedRecord.cropType} · {selectedRecord.suspectedDisease}
                </h2>
                <p className="modal-subtext">
                  问诊时间：
                  {new Date(selectedRecord.createdAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                aria-label="关闭"
                onClick={() => setSelectedRecord(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="diag-detail-meta">
                <span className={`risk-badge risk-${selectedRecord.riskLevel}`}>
                  {RISK_LABEL[selectedRecord.riskLevel]}
                </span>
                <span>
                  视觉置信度：
                  {(selectedRecord.confidence * 100).toFixed(1)}%
                </span>
                {selectedRecord.modelName && (
                  <span>模型：{selectedRecord.modelName}</span>
                )}
              </div>

              {(selectedRecord.annotatedImageUrl || selectedRecord.imageUrl) && (
                <img
                  src={
                    selectedRecord.annotatedImageUrl ||
                    selectedRecord.imageUrl
                  }
                  alt="诊断图像"
                  className="diag-detail-img"
                />
              )}

              {selectedRecord.symptomDescription && (
                <div className="diag-detail-section">
                  <h4>症状描述</h4>
                  <p>{selectedRecord.symptomDescription}</p>
                </div>
              )}

              <div className="diag-detail-section">
                <h4>AI 分析</h4>
                <p>{selectedRecord.analysis}</p>
              </div>

              <div className="diag-detail-section">
                <h4>处置建议</h4>
                <p>{selectedRecord.suggestion}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
