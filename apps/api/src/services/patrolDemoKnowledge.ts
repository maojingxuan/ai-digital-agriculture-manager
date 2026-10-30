import type { DemoKnowledgeSource } from "@agri/shared";

// Human-written summaries, not copied articles. Keep source links in saved reports.
export const demoKnowledge: DemoKnowledgeSource[] = [
  {
    id: "corn-northern-leaf-blight-humidity",
    title: "玉米大斑病与高湿环境",
    url: "https://ipm.illinois.edu/diseases/series300/rpd310/",
    reviewedAt: "2026-10-29",
    content:
      "玉米大斑病在凉爽高湿条件下容易流行。相对湿度持续偏高、叶面结露时间长会促进病斑扩展，但单次读数不足以证明感染。检查下部叶片是否出现梭形、灰褐色大型病斑，保留叶片正反面照片供人工确认。",
    tags: ["玉米", "高湿", "湿度", "叶片", "大斑病", "复核"],
  },
  {
    id: "corn-ventilation-resistance",
    title: "玉米田通风与高湿管理",
    url: "https://extension.umn.edu/plant-diseases/corn-leaf-blight",
    reviewedAt: "2026-10-29",
    content:
      "田间郁闭、高湿环境有利于玉米叶斑类病害发生。合理密植、打通行间通风是降低叶面结露的管理方向。先检查长势与排涝条件并继续监测环境，再记录叶片症状；不能仅凭温湿度下病害诊断。抗病品种也不能替代持续巡查。",
    tags: ["玉米", "高湿", "湿度", "通风", "大斑病", "巡查"],
  },
  {
    id: "corn-leaf-wetness-irrigation",
    title: "玉米叶斑类病害与叶面水分",
    url: "https://www.extension.purdue.edu/extmedia/BP/BP-85-W.pdf",
    reviewedAt: "2026-10-29",
    content:
      "引起玉米叶枯和叶斑问题的多种病原需要叶面水分来启动侵染。灌溉应尽量避开傍晚和夜间，保持适当行间通风并观察症状变化。没有清晰叶片照片和进一步核实时，不把叶斑外观判定为特定病害。",
    tags: ["玉米", "叶片", "叶面", "灌溉", "巡查", "复核"],
  },
];

export function searchDemoKnowledge(query: string, documents = demoKnowledge) {
  return documents
    .map((document) => ({
      ...document,
      score:
        document.tags.filter((tag) => query.includes(tag)).length /
        document.tags.length,
    }))
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
