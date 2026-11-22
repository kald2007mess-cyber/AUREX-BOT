import { requireTelegramUser } from "../_lib/telegram.js";
import { json } from "../_lib/user.js";

function maskId(value) {
  const id = String(value || "");
  if (id.length <= 5) return "*".repeat(id.length);
  return id.slice(0, 3) + "*".repeat(Math.max(3, id.length - 5)) + id.slice(-2);
}

function player(row, rank) {
  return {
    rank: rank > 99 ? "99+" : String(rank),
    name: row.first_name || row.username || "مستخدم AUREX",
    maskedId: maskId(row.telegram_id),
    balance: Number(row.balance || 0)
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!env.AUREX_DB) return json({ error: "database_not_bound" }, 503);

  const auth = await requireTelegramUser(request, env);
  if (auth.error) return auth.error;

  const telegramId = String(auth.user.id);
  const topRows = await env.AUREX_DB.prepare(
    "SELECT telegram_id, username, first_name, balance FROM users ORDER BY balance DESC, taps DESC, telegram_id ASC LIMIT 10"
  ).all();

  const current = await env.AUREX_DB.prepare(
    "SELECT telegram_id, username, first_name, balance, taps FROM users WHERE telegram_id = ?"
  ).bind(telegramId).first();

  if (!current) return json({ error: "user_not_found" }, 404);

  const ahead = await env.AUREX_DB.prepare(
    "SELECT COUNT(*) AS total FROM users WHERE balance > ? OR (balance = ? AND taps > ?) OR (balance = ? AND taps = ? AND telegram_id < ?)"
  ).bind(Number(current.balance || 0), Number(current.balance || 0), Number(current.taps || 0), Number(current.balance || 0), Number(current.taps || 0), telegramId).first();

  const rank = Number(ahead?.total || 0) + 1;
  return json({
    top: (topRows.results || []).map((row, index) => player(row, index + 1)),
    me: player(current, rank),
    rank
  });
}
