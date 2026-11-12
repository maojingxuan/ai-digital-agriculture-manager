export const demoGreenhouseAnswer = {
  presentation: "demo-greenhouse-status" as const,
  content:
    "1号玉米大棚当前状态：空气温度 21.4℃（正常），空气湿度 86%（偏高），土壤湿度 50%（正常），光照强度 1200 lux（正常），CO₂ 561 ppm（正常），水箱水位 54%（正常）。当前有 1 项指标需要关注：空气湿度 86%。建议短时通风排湿，暂缓喷淋，并持续观察湿度变化。",
  speech:
    "1号玉米大棚当前温度二十一点四摄氏度，空气湿度百分之八十六，其余指标正常。当前需要关注湿度偏高，建议短时通风排湿。",
};

/**
 * 演示问句在浏览器内直接命中，避免等待 Agent、数据库和模型。
 * 仅覆盖明确的环境状态问句，历史、趋势及控制类问题仍走真实接口。
 */
export function matchesDemoGreenhouseQuestion(rawText: string) {
  const text = rawText.replace(/[\s，。！？、,.!?]/g, "").toLowerCase();
  const asksEnvironment = ["环境", "状态", "指标", "怎么样", "如何"].some(
    (keyword) => text.includes(keyword),
  );
  const targetsDemoGreenhouse = [
    "1号",
    "一号",
    "玉米大棚",
    "今日环境",
    "今天环境",
  ].some((keyword) => text.includes(keyword));
  const requiresRealtimeFlow = [
    "历史",
    "趋势",
    "曲线",
    "过去",
    "控制",
    "打开",
    "关闭",
  ].some((keyword) => text.includes(keyword));

  return asksEnvironment && targetsDemoGreenhouse && !requiresRealtimeFlow;
}
