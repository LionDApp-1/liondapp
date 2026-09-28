export const SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
export const SKR_DECIMALS = 6;
export const RECOMMENDATION_DAYS = 7;

export function parsePositiveIntegerSkr(value) {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("price_required");
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) throw new Error("price_must_be_positive_integer");
  return BigInt(text) * 10n ** BigInt(SKR_DECIMALS);
}

export function formatSkrBaseUnits(baseUnits) {
  const amount = BigInt(baseUnits);
  if (amount < 0n || amount % (10n ** BigInt(SKR_DECIMALS)) !== 0n) throw new Error("non_integer_skr");
  return (amount / (10n ** BigInt(SKR_DECIMALS))).toString();
}

