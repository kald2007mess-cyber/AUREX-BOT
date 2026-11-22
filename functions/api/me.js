import { requireTelegramUser } from "../_lib/telegram.js";
import { getOrCreateUser, withEnergyRegen, TAP_REWARDS, json } from "../_lib/user.js";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!env.AUREX_DB) return json({ error: "database_not_bound" }, 503);

  const auth = await requireTelegramUser(request, env);
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const startParam = params.get("start_param") || "";
  const user = await getOrCreateUser(env.AUREX_DB, auth.user, startParam);
  const energy = withEnergyRegen(user);

  await env.AUREX_DB.prepare(
    "UPDATE users SET energy = ?, energy_updated_at = ?, updated_at = datetime('now') WHERE telegram_id = ?"
  ).bind(energy.energy, energy.energyUpdatedAt, String(auth.user.id)).run();

  return json({
    user: {
      telegramId: String(user.telegram_id),
      username: user.username,
      firstName: user.first_name,
      photoUrl: auth.user.photo_url || null,
      balance: Number(user.balance),
      taps: Number(user.taps),
      tapLevel: Number(user.tap_level),
      tapReward: TAP_REWARDS[Math.max(0, Math.min(5, Number(user.tap_level) || 0))],
      energy: energy.energy,
      maxEnergy: energy.capacity,
      energyLevel: energy.energyLevel,
      energyRegenSeconds: energy.regenSeconds,
      referralCode: user.referral_code
    }
  });
}
