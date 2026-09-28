export const categories = ["天马行空", "DeFi", "支付", "游戏", "NFT", "社交", "DePIN", "AI", "效率工具", "开发者工具", "教育", "其他"];
export const contentKinds = ["need", "work"];
export const moderationStates = ["pending", "published", "rejected", "removed"];
export const needStates = ["open", "removed"];

export function isValidTag(tag) {
  return typeof tag === "string" && tag.trim().length > 0 && tag.trim().length <= 32;
}

export function validateNeedPayload(input) {
  const errors = [];
  const format = input.format ?? "structured";
  if (format !== "structured" && format !== "wild") errors.push("format");
  if (!input.title?.trim() || input.title.trim().length > 120) errors.push("title");
  if (!input.problem?.trim() || input.problem.trim().length > 5000) errors.push("problem");
  if (format === "structured" && (!input.solutionIdea?.trim() || input.solutionIdea.trim().length > 5000)) errors.push("solutionIdea");
  if (!input.audience?.trim() || input.audience.trim().length > 500) errors.push("audience");
  if (format === "structured" && !categories.includes(input.category)) errors.push("category");
  if (!Array.isArray(input.tags) || input.tags.length > 5 || !input.tags.every(isValidTag)) errors.push("tags");
  if (input.mediaKeys !== undefined && (!Array.isArray(input.mediaKeys) || input.mediaKeys.length > 0)) errors.push("mediaKeys");
  return errors;
}

export function validateWorkPayload(input) {
  const errors = [];
  if (!input.name?.trim() || input.name.trim().length > 120) errors.push("name");
  if (!input.summary?.trim() || input.summary.trim().length > 240) errors.push("summary");
  if (!input.description?.trim() || input.description.trim().length > 8000) errors.push("description");
  if (!categories.includes(input.category)) errors.push("category");
  if (!Array.isArray(input.tags) || input.tags.length > 5 || !input.tags.every(isValidTag)) errors.push("tags");
  if (!input.iconKey || !Array.isArray(input.screenshotKeys) || input.screenshotKeys.length < 2 || input.screenshotKeys.length > 5) errors.push("media");
  if (input.demoUrl && !/^https:\/\//i.test(input.demoUrl)) errors.push("demoUrl");
  return errors;
}
