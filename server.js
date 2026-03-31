const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.PORT || 3333);
const DB_PATH = process.env.DB_PATH || "profiles.sqlite";

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    transaction_date TEXT,
    account_number TEXT,
    status TEXT,
    data_json TEXT NOT NULL
  );
`);

function nowIso() {
  return new Date().toISOString();
}

function safeString(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function deriveNameFromCookiePayload(cookiePayload) {
  try {
    const url = cookiePayload?.url;
    if (!url) return "cloud";
    const host = new URL(url).hostname;
    return host || "cloud";
  } catch (_) {
    return "cloud";
  }
}

function parseCookiePayload(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
}

function pickProfileResponseFromRow(row) {
  let data = null;
  try {
    data = JSON.parse(row.data_json);
  } catch (_) {
    data = { url: "", cookies: [] };
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    transactionDate: row.transaction_date || row.created_at,
    accountNumber: row.account_number,
    status: row.status || "active",
    data,
  };
}

app.get("/api", (req, res) => {
  const action = String(req.query.action || "");
  if (action !== "list_profiles") {
    return res.status(400).json({ ok: false, error: "Unsupported action" });
  }

  const rows = db
    .prepare(
      `SELECT
        id, name, created_at, updated_at, transaction_date, account_number, status, data_json
       FROM profiles
       ORDER BY created_at DESC
       LIMIT 1000`,
    )
    .all();

  return res.json({ profiles: rows.map(pickProfileResponseFromRow) });
});

app.post("/api", (req, res) => {
  const body = req.body || {};
  const action = body.action ? String(body.action) : "";

  if (!body.id && action !== "delete") {
    return res.status(400).json({ ok: false, error: "Missing id" });
  }

  if (action === "delete") {
    const id = safeString(body.id);
    if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
    const info = db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
    return res.json({ ok: true, deleted: info.changes });
  }

  const id = safeString(body.id);
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

  const cookiePayload = parseCookiePayload(body.cookie);
  if (!cookiePayload || typeof cookiePayload !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid cookie payload" });
  }
  if (!cookiePayload.url || !Array.isArray(cookiePayload.cookies)) {
    // Không chặn quá cứng: extension chủ yếu cần url + cookies khi render.
    // Nếu thiếu, vẫn lưu để bạn debug.
  }

  const createdNow = nowIso();
  const updatedNow = createdNow;

  // When importing/exporting backups, extension có thể gửi sẵn các mốc thời gian.
  // Nếu thiếu, backend sẽ tự tạo thời điểm hiện tại.
  const createdAt =
    typeof body.createdAt === "string" && body.createdAt
      ? String(body.createdAt)
      : createdNow;
  const transactionDate =
    typeof body.transactionDate === "string" && body.transactionDate
      ? String(body.transactionDate)
      : createdNow;

  const name =
    safeString(body.name) || deriveNameFromCookiePayload(cookiePayload);
  const status = safeString(body.status) || "active";

  // upsert (cho cả action update và trường hợp action rỗng - extension dùng khi "Lưu ho so")
  db.prepare(
    `INSERT INTO profiles
      (id, name, created_at, updated_at, transaction_date, account_number, status, data_json)
     VALUES
      (@id, @name, @created_at, @updated_at, @transaction_date, @account_number, @status, @data_json)
     ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at,
      transaction_date = excluded.transaction_date,
      account_number = excluded.account_number,
      status = excluded.status,
      data_json = excluded.data_json`,
  ).run({
    id,
    name,
    created_at: createdAt,
    updated_at: updatedNow,
    transaction_date: transactionDate,
    account_number:
      body.accountNumber === undefined || body.accountNumber === null
        ? null
        : safeString(body.accountNumber),
    status,
    data_json: JSON.stringify(cookiePayload),
  });

  return res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cookie-switcher backend listening on :${PORT} (DB=${DB_PATH})`);
});
