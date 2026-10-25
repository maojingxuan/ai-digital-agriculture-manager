import type { DemoKnowledgeSource, DemoScenario } from "@agri/shared";

// Human-written summaries, not copied articles. Keep source links in saved reports.
export const demoKnowledge: DemoKnowledgeSource[] = [
  {
    id: "umn-leaf-mold-humidity",
    title: "明尼苏达大学推广：番茄叶霉病与高湿",
    url: "https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/tomato-leaf-mold",
    reviewedAt: "2026-10-07",
    content:
      "番茄叶霉病在温室中需要关注高湿条件。相对湿度达到或超过85%会促进严重流行，但低于85%也可能发病；单次读数不足以证明感染。检查叶正面的黄斑以及对应叶背的橄榄色至棕色霉层，保留叶片正反面照片供人工确认。",
    tags: ["番茄", "高湿", "湿度", "叶片", "叶霉病", "复核"],
  },
  {
    id: "psu-leaf-mold-ventilation",
    title: "宾夕法尼亚州立大学推广：高棚叶霉病管理",
    url: "https://extension.psu.edu/managing-leaf-mold-in-high-tunnels",
    reviewedAt: "2026-10-07",
    content:
      "高棚的高湿环境有利于番茄叶霉病。通风与空气流动是降低湿度的管理方向。先检查通风条件并继续监测环境，再记录叶片症状；不能仅凭温湿度下病害诊断。品种抗性也不能替代持续巡查。",
    tags: ["番茄", "高湿", "湿度", "通风", "叶霉病", "巡查"],
  },
  {
    id: "umn-tomato-leaf-wetness",
    title: "明尼苏达大学推广：番茄叶斑类病害与叶面水分",
    url: "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/yard-and-garden-problems/tomato-leaf-spot-diseases",
    reviewedAt: "2026-10-07",
    content:
      "引起番茄叶枯和叶斑问题的多种病原需要叶面水分来启动感染。浇水应尽量避开叶面，保持适当空气流动并观察症状变化。没有清晰叶片照片和进一步核实时，不把叶斑外观判定为特定病害。",
    tags: ["番茄", "叶片", "叶面", "灌溉", "巡查", "复核"],
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

export const demoScenarios: DemoScenario[] = [
  {
    id: "normal",
    name: "常规巡查",
    plotName: "仿真 · 一号番茄棚",
    humidity: 68,
    temperature: 25,
    soilMoisture: 52,
    imageUrl: "/demo/tomato-normal.svg",
    imageSource: "项目自绘SVG叶片示意图 v1；不是实拍照片，不用于训练。",
    visualFinding: "演示设定：未标出明显叶部异常；不等于真实植株健康。",
  },
  {
    id: "high-humidity",
    name: "高湿与叶部异常",
    plotName: "仿真 · 一号番茄棚",
    humidity: 91,
    temperature: 25,
    soilMoisture: 52,
    imageUrl: "/demo/tomato-spots.svg",
    imageSource: "项目自绘SVG黄斑叶片示意图 v1；不是实拍照片，不用于训练。",
    visualFinding:
      "演示设定：叶面有黄斑，需要进一步查看叶背并人工复核；尚不能确定病害种类。",
  },
];
