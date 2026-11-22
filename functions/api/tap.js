import { requireTelegramUser } from "../_lib/telegram.js";
import { getOrCreateUser, withEnergyRegen, TAP_REWARDS, json } from "../_lib/user.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.AUREX_DB) return json({ error: "database_not_bound" }, 503);

  const auth = await requireTelegramUser(request, env);
  if (auth.error) return auth.error;

  const telegramId = String(auth.user.id);
  const user = await getOrCreateUser(env.AUREX_DB, auth.user);
  const energy = withEnergyRegen(user);
  if (energy.energy < 1) {
    await env.AUREX_DB.prepare(
      "UPDATE users SET energy = ?, energy_updated_at = ? WHERE telegram_id = ?"
    ).bind(energy.energy, energy.energyUpdatedAt, telegramId).run();
    return json({ error: "not_enough_energy", energy: energy.energy, maxEnergy: energy.capacity }, 409);
  }

  const level = Math.max(0, Math.min(5, Number(user.tap_level) || 0));
  const reward = TAP_REWARDS[level];
  const nextEnergy = energy.energy - 1;
  const nextBalance = Math.round((Number(user.balance) + reward) * 100) / 100;
  const now = Date.now();

  await env.AUREX_DB.batch([
    env.AUREX_DB.prepare(
      "UPDATE users SET balance = ?, energy = ?, energy_updated_at = ?, taps = taps + 1, updated_at = datetime('now') WHERE telegram_id = ?"
    ).bind(nextBalance, nextEnergy, energy.energyUpdatedAt, telegramId),
    env.AUREX_DB.prepare(
      "INSERT INTO tap_events (telegram_id, amount) VALUES (?, ?)"
    ).bind(telegramId, reward)
  ]);

  return json({
    success: true,
    reward,
    balance: nextBalance,
    taps: Number(user.taps) + 1,
    energy: nextEnergy,
    maxEnergy: energy.capacity,
    serverTime: now
  });
}
