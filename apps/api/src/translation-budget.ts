import type { Env } from "./types";

// This is a local request cap, not the Cloudflare account's billing meter.
// At <=900 source characters, <=2048 output tokens and the bounded prompt,
// reserve a conservative 100 Neurons/request using the 2026-09-27 model rates.
// Never refund failures: the provider may have charged for incomplete requests.
export const TRANSLATION_DAILY_CALL_LIMIT = 30;
export class TranslationPaused extends Error {
  constructor(public reason: "daily_budget" | "provider_quota") { super(reason); }
}
const day = () => new Date(Date.now()).toISOString().slice(0, 10);

export async function reserveTranslationCall(env: Env): Promise<void> {
  const row = await env.DB.prepare(`INSERT INTO catalog_translation_daily(day,calls) VALUES(?,1)
    ON CONFLICT(day) DO UPDATE SET calls=calls+1
    WHERE paused=0 AND calls<? RETURNING calls`).bind(day(), TRANSLATION_DAILY_CALL_LIMIT).first();
  if (!row) throw new TranslationPaused("daily_budget");
}

export async function pauseTranslationForToday(env: Env): Promise<void> {
  await env.DB.prepare("UPDATE catalog_translation_daily SET paused=1 WHERE day=?").bind(day()).run();
}

export async function translationBudgetStatus(env: Env) {
  const currentDay = day();
  const row = await env.DB.prepare("SELECT calls,paused FROM catalog_translation_daily WHERE day=?").bind(currentDay).first<{ calls: number; paused: number }>();
  return { day: currentDay, calls: row?.calls ?? 0, limit: TRANSLATION_DAILY_CALL_LIMIT,
    paused: Boolean(row?.paused) || Number(row?.calls ?? 0) >= TRANSLATION_DAILY_CALL_LIMIT,
    resets_at: new Date(Date.parse(currentDay + "T00:00:00Z") + 86400_000).toISOString(),
    estimated_neuron_ceiling: TRANSLATION_DAILY_CALL_LIMIT * 100,
    account_billing_verified: false };
}
