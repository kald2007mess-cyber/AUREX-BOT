export const TAP_REWARDS = [0.01, 0.02, 0.03, 0.05, 0.08, 0.12];
export const ENERGY_CAPACITIES = [500, 1000, 1500, 2000, 3000];
export const ENERGY_FULL_REGEN_MS = 7200000;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function makeReferralCode() {
  return "ARX" + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

export async function getOrCreateUser(db, telegramUser, startParam = "") {
  const telegramId = String(telegramUser.id);
  let user = await db.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegramId).first();

  if (!user) {
    let referredBy = null;
    const match = /^ref_([A-Za-z0-9_-]{3,40})$/.exec(startParam);
    if (match) {
      const referrer = await db.prepare("SELECT telegram_id FROM users WHERE referral_code = ?")
        .bind(match[1]).first();
      if (referrer && referrer.telegram_id !== telegramId) referredBy = referrer.telegram_id;
    }
    await db.prepare(`
      INSERT OR IGNORE INTO users
        (telegram_id, username, first_name, balance, energy, energy_level, tap_level,
         taps, referred_by, referral_code, energy_updated_at)
      VALUES (?, ?, ?, 0, 500, 0, 0, 0, ?, ?, ?)
    `).bind(
      telegramId, telegramUser.username || null, telegramUser.first_name || null,
      referredBy, makeReferralCode(), Date.now()
    ).run();
  } else {
    await db.prepare(
      "UPDATE users SET username = ?, first_name = ?, updated_at = datetime('now') WHERE telegram_id = ?"
    ).bind(telegramUser.username || null, telegramUser.first_name || null, telegramId).run();
  }
  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegramId).first();
}

export function withEnergyRegen(user, now = Date.now()) {
  const level = Math.max(0, Math.min(4, Number(user.energy_level) || 0));
  const capacity = ENERGY_CAPACITIES[level];
  const interval = ENERGY_FULL_REGEN_MS / capacity;
  let energy = Math.max(0, Math.min(capacity, Number(user.energy) || 0));
  let updatedAt = Number(user.energy_updated_at) || now;

  if (energy >= capacity) {
    energy = capacity;
    updatedAt = now;
  } else {
    const gained = Math.floor(Math.max(0, now - updatedAt) / interval);
    if (gained > 0) {
      energy = Math.min(capacity, energy + gained);
      updatedAt += gained * interval;
      if (energy >= capacity) updatedAt = now;
    }
  }
  return { energy, capacity, energyLevel: level, energyUpdatedAt: updatedAt, regenSeconds: interval / 1000 };
}
