ALTER TABLE users ADD COLUMN energy_updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET energy_updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE energy_updated_at = 0;
