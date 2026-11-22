import { requireTelegramUser } from "../_lib/telegram.js";
import { getOrCreateUser, withEnergyRegen, TAP_REWARDS, json } from "../_lib/user.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.AUREX_DB) return json({ error: "database_not_bound" }, 503);

  const auth = await requireTelegramUser(request, env);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const count = Math.max(1, Math.min(10, Math.floor(Number(body.count) || 1)));
  const telegramId = String(auth.user.id);
  const user = await getOrCreateUser(env.AUREX_DB, auth.user);
  const energy = withEnergyRegen(user);

  await env.AUREX_DB.prepare(
    "UPDATE users SET energy = ?, energy_updated_at = ? WHERE telegram_id = ?"
  ).bind(energy.energy, energy.energyUpdatedAt, telegramId).run();

  const level = Math.max(0, Math.min(5, Number(user.tap_level) || 0));
  const reward = TAP_REWARDS[level];
  const updated = await env.AUREX_DB.prepare(`
    UPDATE users
    SET balance = ROUND(balance + ?, 2), energy = energy - ?,
        taps = taps + ?, updated_at = datetime('now')
    WHERE telegram_id = ? AND energy >= ?
    RETURNING balance, energy, taps
  `).bind(reward * count, count, count, telegramId, count).first();

  if (!updated) {
    const latest = await env.AUREX_DB.prepare(
      "SELECT energy FROM users WHERE telegram_id = ?"
    ).bind(telegramId).first();
    return json({ error: "not_enough_energy", energy: Number(latest?.energy || 0), maxEnergy: energy.capacity }, 409);
  }

  const eventStatements = Array.from({ length: count }, () =>
    env.AUREX_DB.prepare(
      "INSERT INTO tap_events (telegram_id, amount) VALUES (?, ?)"
    ).bind(telegramId, reward)
  );
  await env.AUREX_DB.batch(eventStatements);

  return json({
    success: true,
    count,
    reward,
    balance: Number(updated.balance),
    taps: Number(updated.taps),
    energy: Number(updated.energy),
    maxEnergy: energy.capacity,
    serverTime: Date.now()
  });
}
