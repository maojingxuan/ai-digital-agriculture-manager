const embeddingSize = 96;

export const majorCrops = [
  "玉米",
];

const agricultureLexicon = [
  // 核心作物
  ...majorCrops,
  // 作物部位
  "叶片",
  "叶背",
  "叶面",
  "嫩梢",
  "根系",
  "果实",
  "花器",
  "茎秆",
  "维管束",
  "节间",
  // 典型病害
  "霜霉病",
  "白粉病",
  "灰霉病",
  "早疫病",
  "晚疫病",
  "炭疽病",
  "靶斑病",
  "叶斑病",
  "叶霉病",
  "病毒病",
  "根腐病",
  "枯萎病",
  "青枯病",
  "溃疡病",
  "软腐病",
  "猝倒病",
  // 症状描述
  "黄褐色",
  "多角形",
  "水浸状",
  "霉层",
  "轮纹",
  "穿孔",
  "黄化",
  "卷叶",
  "枯萎",
  "坏死",
  "斑点",
  "病斑",
  "褪绿",
  "腐烂",
  "萎蔫",
  "白粉",
  "结露",
  "黑斑",
  // 常见虫害
  "虫害",
  "蚜虫",
  "红蜘蛛",
  "白粉虱",
  "烟粉虱",
  "蓟马",
  "潜叶蝇",
  "斑潜蝇",
  "斜纹夜蛾",
  "菜青虫",
  "线虫",
  // 环境与农艺
  "温度",
  "湿度",
  "高湿",
  "通风",
  "降湿",
  "灌溉",
  "土壤",
  "光照",
  "大棚",
  "温室",
  "水肥",
  "农药",
  "施药",
  "药剂",
  "杀菌剂",
  "杀虫剂",
  "安全",
  "间隔期",
  "采收",
  "溯源",
  "滴灌"
];

function hashToken(token: string) {
  let hash = 2166136261;
  for (const char of token) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function tokenize(text: string) {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{1,4}/g) ?? [];
  const lexiconHits: string[] = [];

  for (const keyword of agricultureLexicon) {
    if (normalized.includes(keyword.toLowerCase())) {
      // 核心作物与特定病害给予 3 倍加权
      if (majorCrops.includes(keyword) || keyword.endsWith("病") || keyword.endsWith("虫")) {
        lexiconHits.push(keyword, keyword, keyword);
      } else {
        lexiconHits.push(keyword, keyword);
      }
    }
  }

  return [...words, ...lexiconHits];
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export class EmbeddingService {
  createEmbedding(text: string) {
    const vector = Array.from({ length: embeddingSize }, () => 0);
    const tokens = tokenize(text);

    for (const token of tokens) {
      const index = hashToken(token) % embeddingSize;
      vector[index] += 1;
    }

    return normalize(vector);
  }

  similarity(left: number[], right: number[]) {
    const length = Math.min(left.length, right.length);
    let score = 0;

    for (let index = 0; index < length; index += 1) {
      score += left[index] * right[index];
    }

    return Number(score.toFixed(6));
  }
}

export const embeddingService = new EmbeddingService();
