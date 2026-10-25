import type { DemoRun, DemoReportEvidence } from "@agri/shared";

export function PatrolEvidence({
  evidence,
}: {
  evidence:
    | Pick<DemoRun, "environment" | "visual" | "sources" | "recommendations">
    | DemoReportEvidence;
}) {
  return (
    <div className="demo-evidence">
      {evidence.environment && (
        <section
          className={`demo-proof ${evidence.environment.risk ? "is-risk" : ""}`}
        >
          <h3>环境证据 · 仿真计算</h3>
          <div className="demo-metrics">
            <span>
              湿度 <strong>{evidence.environment.humidity}%</strong>
            </span>
            <span>
              温度 <strong>{evidence.environment.temperature}℃</strong>
            </span>
            <span>
              阈值 <strong>{evidence.environment.threshold}%</strong>
            </span>
          </div>
          <p>{evidence.environment.explanation}</p>
          {evidence.environment.threshold !== 85 && (
            <small>
              当前为用户调整的演示阈值；资料中的85%不是万能安全边界。
            </small>
          )}
        </section>
      )}
      {evidence.visual && (
        <section className="demo-proof">
          <h3>叶片证据 · 演示预设</h3>
          <img
            src={evidence.visual.imageUrl}
            alt="本项目自绘叶片示意，不是真实照片或模型推理"
          />
          <p>{evidence.visual.finding}</p>
          <small>{evidence.visual.notice}</small>
          <small>{evidence.visual.source}</small>
        </section>
      )}
      {Boolean(evidence.sources?.length) && (
        <section className="demo-proof">
          <h3>知识依据 · 本地关键词检索</h3>
          <p>
            以下是人工整理的来源摘要，不是大模型生成，也不是外网实时检索。检索匹配度不是诊断置信度。
          </p>
          {evidence.sources?.map((source, index) => (
            <details key={source.id}>
              <summary>
                [{index + 1}] {source.title}
              </summary>
              <p>{source.content}</p>
              <a href={source.url} target="_blank" rel="noreferrer">
                查看原始资料（需要联网）
              </a>
              <small>
                核对日期：{source.reviewedAt}
                {source.score !== undefined
                  ? ` · 关键词匹配 ${(source.score * 100).toFixed(0)}%`
                  : " · 管理参考资料"}
              </small>
            </details>
          ))}
        </section>
      )}
      {Boolean(evidence.recommendations?.length) && (
        <section className="demo-proof">
          <h3>管理建议 · 待人工确认</h3>
          <ul>
            {evidence.recommendations?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
