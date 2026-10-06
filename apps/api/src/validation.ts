import { ApiError } from "./http";

export const categories = ["天马行空", "DeFi", "支付", "游戏", "NFT", "社交", "DePIN", "AI", "效率工具", "开发者工具", "教育", "其他"];

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ApiError(400, `invalid_${field}`);
  return value.trim();
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return text(value, field, max);
}

function list(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ApiError(400, `invalid_${field}`);
  }
  return value.map((item) => item.trim());
}

function category(value: unknown): string {
  if (typeof value !== "string" || !categories.includes(value)) throw new ApiError(400, "invalid_category");
  return value;
}

export function needPayload(body: Record<string, unknown>) {
  const kind = body.kind ?? 'need';
  if (kind !== 'need' && kind !== 'feedback') throw new ApiError(400, 'invalid_need_kind');
  const feedbackType = kind === 'feedback' ? body.feedbackType ?? 'suggestion' : null;
  if (feedbackType !== null && !['issue','suggestion','praise'].includes(String(feedbackType))) throw new ApiError(400, 'invalid_feedback_type');
  const storePackage = optionalText(body.storePackage, 'store_package', 200);
  if (kind === 'feedback' && !storePackage) throw new ApiError(400, 'feedback_app_required');
  const common = { kind, feedbackType, storePackage };
  const requestType = body.requestType === "paid_development" ? "paid_development" : body.requestType === undefined || body.requestType === "free" ? "free" : null;
  if (!requestType) throw new ApiError(400, "invalid_request_type");
  const rawBudget = body.budgetSkr;
  const budgetSkr = requestType === "paid_development" ? (() => {
    if (typeof rawBudget !== "number" || !Number.isSafeInteger(rawBudget) || rawBudget < 1 || rawBudget > 1_000_000_000) throw new ApiError(400, "invalid_budget_skr");
    return rawBudget;
  })() : null;
  const mediaKeys = list(body.mediaKeys ?? [], "media_keys", 3);
  if (mediaKeys.length > 0) throw new ApiError(400, "need_media_not_supported");
  const format = body.format === undefined ? "structured" : body.format;
  if (format !== "structured" && format !== "wild") throw new ApiError(400, "invalid_need_format");
  if (format === "wild") {
    if (kind === 'feedback') throw new ApiError(400, 'invalid_need_format');
    return {
      ...common,
      format,
      title: text(body.title, "title", 120),
      problem: text(body.problem, "idea", 5000),
      solutionIdea: "",
      audience: optionalText(body.audience, "audience", 500) ?? '',
      category: "天马行空",
      tags: [],
      mediaKeys,
      requestType,
      budgetSkr,
    };
  }
  return {
    ...common,
    format,
    title: text(body.title, "title", 120),
    problem: text(body.problem, "problem", 5000),
    solutionIdea: optionalText(body.solutionIdea, "solution_idea", 5000) ?? '',
    audience: optionalText(body.audience, "audience", 500) ?? '',
    category: category(body.category ?? '其他'),
    tags: list(body.tags ?? [], "tags", 5).map((tag) => text(tag, "tag", 32)),
    mediaKeys,
    requestType,
    budgetSkr,
  };
}

export function workPayload(body: Record<string, unknown>) {
  const demoUrl = optionalText(body.demoUrl, "demo_url", 500);
  if (demoUrl && !/^https:\/\//i.test(demoUrl)) throw new ApiError(400, "invalid_demo_url");
  const screenshotKeys = list(body.screenshotKeys ?? [], "screenshot_keys", 5);
  if (screenshotKeys.length < 2) throw new ApiError(400, "work_images_3_to_6_required");
  return {
    storePackage: optionalText(body.storePackage, 'store_package', 200),
    name: text(body.name, "name", 120),
    summary: text(body.summary, "summary", 240),
    description: text(body.description, "description", 8000),
    storeUrl: "",
    category: category(body.category),
    tags: list(body.tags ?? [], "tags", 5).map((tag) => text(tag, "tag", 32)),
    iconKey: text(body.iconKey, "icon_key", 200),
    screenshotKeys,
    demoUrl,
  };
}

export function commentPayload(body: Record<string, unknown>) {
  return { body: text(body.body, "comment", 2000), parentId: optionalText(body.parentId, "parent_id", 80) };
}
