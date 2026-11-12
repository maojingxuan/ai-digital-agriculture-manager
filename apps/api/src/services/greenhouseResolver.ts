/**
 * 从自然语言里识别用户说的是哪个大棚。
 *
 * 用户实际表达非常多样：
 *   「二号大棚」「2号大棚」「第二号棚」「二号棚」「2号叶菜大棚」
 *   「叶菜大棚」「西红柿大棚」「番茄那个棚」
 * 早期实现只匹配「2号」「3号」这种阿拉伯数字，用户说「二号」时会
 * 静默回落到 1 号棚，导致明明问二号棚、回答的却是一号棚数据。
 *
 * 这里把中文数字归一化后再匹配，并支持「第二个」「二棚」等口语形式。
 */

const CN_NUM = "零一二三四五六七八九";

/** 把中文数字（二 / 十二 / 两）转换成阿拉伯数字字符串 */
function normalizeChineseNumeral(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s === "两") return "2";
  // 单个汉字数字
  const idx = CN_NUM.indexOf(s);
  if (idx >= 0) return String(idx);
  // 十、十一、十二……
  if (s.startsWith("十")) return s.length === 1 ? "10" : `1${normalizeChineseNumeral(s.slice(1)) ?? ""}`;
  const tenAt = s.indexOf("十");
  if (tenAt > 0) {
    const tens = normalizeChineseNumeral(s.slice(0, tenAt));
    const ones = normalizeChineseNumeral(s.slice(tenAt + 1));
    return `${tens ?? "1"}${ones ?? "0"}`;
  }
  return null;
}

/**
 * 从文本中提取大棚序号（1/2/3），提取不到返回 null。
 * 匹配优先级：数字 + 号/棚/栋/座 > 中文数字 + 棚 > 作物名
 */
export function greenhouseNumberFromText(text: string): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 1) 阿拉伯数字：2号 / 2 号 / 第2 / 2棚 / 2栋
  const arabic = lower.match(/(?:第\s*)?([0-9]+)\s*(?:号|棚|栋|座|个大棚|个大棚)/);
  if (arabic) {
    const n = Number(arabic[1]);
    if (Number.isFinite(n) && n >= 1) return n;
  }

  // 2) 中文数字：二号 / 第二号 / 二棚 / 第二个棚
  const chinese = lower.match(
    /(?:第)?([零一二三四五六七八九两十]+)\s*(?:号|棚|栋|座|个大棚)/,
  );
  if (chinese) {
    const n = normalizeChineseNumeral(chinese[1]);
    if (n !== null) {
      const num = Number(n);
      if (Number.isFinite(num) && num >= 1) return num;
    }
  }

  // 3) 完全只写了「第2」「2」这种口语省略形式（少见但兜底）
  const bare = lower.match(/第\s*([0-9]+)/);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n >= 1) return n;
  }

  return null;
}

/** 作物关键词 → 大棚序号 */
function greenhouseNumberFromCrop(text: string): number | null {
  const t = text ?? "";
  if (t.includes("番茄") || t.includes("西红柿")) return 3;
  if (t.includes("叶菜") || t.includes("生菜") || t.includes("青菜")) return 2;
  if (t.includes("玉米") || t.includes("水稻")) return 1;
  return null;
}

/**
 * 统一入口：把用户文本映射到 demo-gh-N。
 * 序号优先于作物（因为「2号番茄大棚」这句里序号和作物指向不同棚时，以序号为准）。
 */
export function greenhouseIdFromText(text: string): string {
  const byNumber = greenhouseNumberFromText(text);
  if (byNumber !== null) return `demo-gh-${byNumber}`;
  const byCrop = greenhouseNumberFromCrop(text);
  if (byCrop !== null) return `demo-gh-${byCrop}`;
  return "demo-gh-1";
}

/** 大棚序号 → 中文说法，用于话术里回显「您问的是2号棚」 */
export function greenhouseLabelFromId(id: string): string {
  const n = id.replace(/^demo-gh-/, "");
  const cn = n
    .split("")
    .map((c) => CN_NUM[Number(c)] ?? c)
    .join("");
  return `${cn}号大棚`;
}
