import { ApiError } from "./http";
import type { Env } from "./types";

export type ModerationCategory = "sexual" | "crime" | "violence" | "politics" | "hate" | "wallet_abuse";

interface ModerationRuleGroup {
  category: ModerationCategory;
  phrases: readonly string[];
}

const RULE_GROUPS: readonly ModerationRuleGroup[] = [
  {
    category: "sexual",
    phrases: [
      "儿童色情", "未成年裸照", "未成年色情", "招嫖", "卖淫服务", "裸聊服务", "成人视频", "强奸视频", "兽交视频", "卖淫", "嫖娼", "援交", "约炮服务", "色情服务", "出售裸照",
      "child porn", "child pornography", "child sexual abuse material", "underage nudes", "rape porn", "bestiality porn", "buy nudes", "nudes for sale", "porn download",
    ],
  },
  {
    category: "crime",
    phrases: [
      "洗钱教程", "代洗钱", "出售毒品", "购买毒品", "制毒教程", "炸弹制作", "制作炸弹", "枪支买卖", "出售枪支", "盗号服务", "黑客入侵服务", "电信诈骗教程", "伪造证件", "出售身份证", "买卖银行卡", "暗网交易",
      "money laundering service", "how to launder money", "drugs for sale", "buy illegal drugs", "sell illegal drugs", "make a bomb", "bomb making instructions", "hire a hacker", "stolen credit cards", "fake passport for sale", "identity documents for sale",
    ],
  },
  {
    category: "violence",
    phrases: [
      "恐怖袭击计划", "加入恐怖组织", "暗杀教程", "杀人教程", "校园枪击计划",
      "plan a terrorist attack", "join a terrorist organization", "assassination instructions", "how to murder", "school shooting plan",
    ],
  },
  {
    category: "politics",
    phrases: [
      "政治宣传", "政治动员", "竞选拉票", "政治募款", "选举操纵", "推翻政府", "煽动颠覆", "暴力革命", "暗杀总统", "暗杀国家领导人",
      "习近平", "共产党", "中国共产", "中共", "共產黨", "xi jinping", "chinese communist party", "communist party of china", "ccp",
      "台独", "港独", "藏独", "疆独", "东突", "法轮功", "六四事件", "六四运动", "天安门事件", "天安门屠杀", "8964", "刘晓波", "毛泽东", "邓小平", "江泽民", "胡锦涛",
      "taiwan independence", "hong kong independence", "tibet independence", "east turkestan", "falun gong", "tiananmen massacre",
      "political propaganda", "political mobilization", "election campaigning", "campaign fundraising", "election manipulation", "overthrow the government", "violent revolution", "assassinate the president", "assassinate a head of state",
    ],
  },
  {
    category: "hate",
    phrases: [
      "你去死", "去死吧", "杀了你", "弄死你", "你是傻逼", "你是傻比", "你这个傻逼", "你个傻逼", "你妈死了", "操你妈", "草你妈", "你是废物",
      "kill yourself", "i will kill you", "you are an idiot", "you are a piece of shit", "fuck you",
      "种族灭绝宣传", "仇恨宣传", "纳粹招募", "genocide advocacy", "racial extermination", "white supremacy recruitment", "nazi recruitment",
    ],
  },
  {
    category: "wallet_abuse",
    phrases: [
      "输入助记词领取", "发送助记词", "提交私钥", "客服索要助记词", "verify your seed phrase", "send me your seed phrase", "enter your private key", "wallet support needs your seed phrase",
    ],
  },
];

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[賣婬習兒歲錢槍殺媽廢產黨國獨東輪門運動劉曉澤鄧錦濤]/g, (character) => ({ 賣: "卖", 婬: "淫", 習: "习", 兒: "儿", 歲: "岁", 錢: "钱", 槍: "枪", 殺: "杀", 媽: "妈", 廢: "废", 產: "产", 黨: "党", 國: "国", 獨: "独", 東: "东", 輪: "轮", 門: "门", 運: "运", 動: "动", 劉: "刘", 曉: "晓", 澤: "泽", 鄧: "邓", 錦: "锦", 濤: "涛" } as Record<string, string>)[character] ?? character)
    .toLocaleLowerCase("en-US")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string): string {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

const PREPARED_RULES = RULE_GROUPS.flatMap((group) => group.phrases.map((phrase) => ({
  category: group.category,
  normalized: normalize(phrase),
  compact: compact(phrase),
})));

export function detectContentPolicyViolation(values: readonly string[]): { category: ModerationCategory } | null {
  for (const value of values) {
    const normalizedValue = normalize(value);
    const compactValue = compact(value);
    if (!normalizedValue) continue;
    for (const rule of PREPARED_RULES) {
      // Compact CJK catches punctuation/zero-width evasion without joining English words
      // (e.g. "therapist" must never become a match for a short banned word).
      const matches = /[\p{Script=Han}]/u.test(rule.normalized)
        ? compactValue.includes(rule.compact)
        : new RegExp(`(?<![a-z0-9])${rule.normalized.split(" ").join("[\\s\\p{P}\\p{S}_]*")}(?![a-z0-9])`, "u").test(normalizedValue);
      if (matches) return { category: rule.category };
    }
  }
  return null;
}


export const MODERATION_VERSION = "2026-09-09.2";

// Only the submitted public text is sent; account identifiers are never included.
export async function assessContentPolicy(env: Pick<Env, "AI">, values: readonly string[]) {
  const violation = detectContentPolicyViolation(values);
  if (violation) return violation;
  const content = values.filter((value) => value.trim()).join("\n\n");
  if (!content) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = await Promise.race([
      env.AI.run("@cf/meta/llama-guard-3-8b", {
        messages: [{ role: "user", content }],
        max_tokens: 64,
        temperature: 0,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("moderation_timeout")), 12000);
      }),
    ]);
    const response = output && typeof output === "object" && "response" in output
      ? String(output.response).trim().toLowerCase() : "";
    // Unknown output and service failures never count as approval.
    if (response === "safe") return null;
    if (/^unsafe(?:\s|$)/.test(response)) {
      const code = response.match(/\bs(\d+)\b/)?.[1];
      const categories: Record<string, ModerationCategory> = {
        "1": "violence", "2": "crime", "3": "sexual", "4": "sexual",
        "7": "wallet_abuse", "9": "violence", "10": "hate", "11": "violence", "12": "sexual", "13": "politics",
      };
      return { category: categories[code ?? ""] ?? "crime" as ModerationCategory };
    }
    throw new Error("invalid_moderation_response");
  } catch {
    throw new ApiError(503, "moderation_unavailable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type ContentSurface = "need" | "work" | "comment" | "profile";
export function contentFields(surface: ContentSurface, row: Record<string, unknown>): string[] {
  const fields = {
    need: ["title", "problem", "solution_idea", "audience", "tags_json"],
    work: ["name", "summary", "description", "tags_json", "demo_url"],
    comment: ["body"],
    profile: ["bio", "social_url"],
  }[surface];
  return fields.map((key) => String(row[key] ?? ""));
}

/** Read-time screening also covers older records without deleting or rewriting them. */
export function isPublicContentAllowed(surface: ContentSurface, row: Record<string, unknown>): boolean {
  return detectContentPolicyViolation(contentFields(surface, row)) === null;
}
