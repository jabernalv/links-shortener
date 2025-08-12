const express = require("express");
const { nanoid } = require("nanoid");
const { getDb } = require("../lib/db");
const {
  getClientIp,
  anonymizeIp,
  hashIp,
  detectBot,
} = require("../lib/analytics");
const { requireAuth } = require("./auth");

const router = express.Router();
const QRCode = require("qrcode");

router.get("/links", requireAuth, (req, res) => {
  const db = getDb();
  const links = db
    .prepare(
      "SELECT id, code, url, total_clicks, created_at FROM links WHERE owner_id = ? ORDER BY id DESC"
    )
    .all(req.session.user.id);
  const toast = req.session.toast || null;
  if (req.session.toast) delete req.session.toast;
  res.render("links", {
    links,
    user: req.session.user,
    createdCode: null,
    error: null,
    toast,
  });
});

const RESERVED_CODES = new Set([
  "login",
  "logout",
  "links",
  "setup",
  "s",
  "stats",
  "api",
  "admin",
]);

router.post("/links", requireAuth, (req, res) => {
  const { url, alias } = req.body;
  const db = getDb();
  if (!url) {
    const links = db
      .prepare(
        "SELECT id, code, url, created_at FROM links WHERE owner_id = ? ORDER BY id DESC"
      )
      .all(req.session.user.id);
    return res.render("links", {
      links,
      user: req.session.user,
      createdCode: null,
      error: null,
      toast: { type: "error", text: "Enter a valid URL" },
    });
  }
  // Normalize URL: if no scheme, prepend https:// and validate
  let normalizedUrl = String(url).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }
  try {
    // Basic validation using WHATWG URL
    // new URL will throw if it's invalid
    // We only check that it is parseable here.
    // eslint-disable-next-line no-new
    new URL(normalizedUrl);
  } catch {
    const links = db
      .prepare(
        "SELECT id, code, url, created_at FROM links WHERE owner_id = ? ORDER BY id DESC"
      )
      .all(req.session.user.id);
    return res.render("links", {
      links,
      user: req.session.user,
      createdCode: null,
      error: null,
      toast: { type: "error", text: "Invalid URL" },
    });
  }

  let code;
  if (alias && alias.trim()) {
    const desired = String(alias).trim();
    const normalized = desired.toLowerCase();
    if (
      !/^[a-z0-9_-]{3,30}$/.test(normalized) ||
      RESERVED_CODES.has(normalized)
    ) {
      const links = db
        .prepare(
          "SELECT id, code, url, created_at FROM links WHERE owner_id = ? ORDER BY id DESC"
        )
        .all(req.session.user.id);
      return res.render("links", {
        links,
        user: req.session.user,
        createdCode: null,
        error: null,
        toast: { type: "error", text: "Invalid or reserved alias" },
      });
    }
    const exists = db
      .prepare("SELECT 1 FROM links WHERE code = ?")
      .get(normalized);
    if (exists) {
      const links = db
        .prepare(
          "SELECT id, code, url, created_at FROM links WHERE owner_id = ? ORDER BY id DESC"
        )
        .all(req.session.user.id);
      return res.render("links", {
        links,
        user: req.session.user,
        createdCode: null,
        error: null,
        toast: { type: "error", text: "Alias not available" },
      });
    }
    code = normalized;
  } else {
    code = nanoid(7).toLowerCase();
  }
  db.prepare("INSERT INTO links (code, url, owner_id) VALUES (?, ?, ?)").run(
    code,
    normalizedUrl,
    req.session.user.id
  );
  req.session.toast = { type: "success", text: `Created: /s/${code}` };
  res.redirect("/links");
});

router.post("/links/:id/delete", requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  db.prepare("DELETE FROM links WHERE id = ? AND owner_id = ?").run(
    id,
    req.session.user.id
  );
  req.session.toast = { type: "success", text: "Link deleted" };
  res.redirect("/links");
});

router.get("/links/:id/qr.png", requireAuth, async (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const row = db
    .prepare("SELECT code, owner_id FROM links WHERE id = ?")
    .get(id);
  if (!row || row.owner_id !== req.session.user.id)
    return res.status(404).send("Not found");
  const fullUrl = `${req.protocol}://${req.get("host")}/s/${row.code}`;
  try {
    res.setHeader("Content-Type", "image/png");
    await QRCode.toFileStream(res, fullUrl, { margin: 1, width: 256 });
  } catch (e) {
    console.error("QR error", e);
    res.status(500).send("Error generating QR");
  }
});

router.get("/links/:id/stats", requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const link = db
    .prepare(
      "SELECT id, code, url, total_clicks, created_at, first_clicked_at, last_clicked_at, owner_id FROM links WHERE id = ?"
    )
    .get(id);
  if (!link || link.owner_id !== req.session.user.id) {
    return res.status(404).send("Not found");
  }

  const { from, to, humansOnly } = req.query;
  const conditions = ["link_id = ?"];
  const params = [id];
  if (from) {
    conditions.push("date(clicked_at) >= date(?)");
    params.push(from);
  }
  if (to) {
    conditions.push("date(clicked_at) <= date(?)");
    params.push(to);
  }
  if (humansOnly === "1") {
    conditions.push("is_bot = 0");
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const totalsStmt = db.prepare(
    `SELECT COUNT(*) AS total, SUM(is_bot) AS bots FROM link_clicks ${where}`
  );
  const totals = totalsStmt.get(...params) || { total: 0, bots: 0 };

  const perDayStmt = db.prepare(`
    SELECT substr(clicked_at,1,10) AS day, COUNT(*) AS c
    FROM link_clicks ${where}
    GROUP BY day ORDER BY day DESC LIMIT 30`);
  const perDay = perDayStmt.all(...params);

  const topReferersStmt = db.prepare(`
    SELECT COALESCE(NULLIF(referer,''),'(directo)') AS k, COUNT(*) AS c
    FROM link_clicks ${where}
    GROUP BY k ORDER BY c DESC LIMIT 10`);
  const topReferers = topReferersStmt.all(...params);

  const topLangsStmt = db.prepare(`
    SELECT COALESCE(substr(accept_language,1,2),'--') AS lang, COUNT(*) AS c
    FROM link_clicks ${where}
    GROUP BY lang ORDER BY c DESC LIMIT 10`);
  const topLangs = topLangsStmt.all(...params);

  const lastClicksStmt = db.prepare(`
    SELECT clicked_at, referer, user_agent, accept_language, is_bot, ip_trunc
    FROM link_clicks ${where}
    ORDER BY id DESC LIMIT 50`);
  const lastClicks = lastClicksStmt.all(...params);

  const queryParts = [];
  if (from) queryParts.push(`from=${encodeURIComponent(from)}`);
  if (to) queryParts.push(`to=${encodeURIComponent(to)}`);
  if (humansOnly === "1") queryParts.push("humansOnly=1");
  const exportQuery = queryParts.join("&");
  const exportUrl =
    `/links/${id}/clicks.csv` + (exportQuery ? `?${exportQuery}` : "");

  res.render("stats", {
    user: req.session.user,
    link,
    totals: {
      total: totals.total || 0,
      bots: totals.bots || 0,
      humans: (totals.total || 0) - (totals.bots || 0),
    },
    perDay,
    topReferers,
    topLangs,
    lastClicks,
    filters: { from: from || "", to: to || "", humansOnly: humansOnly === "1" },
    exportUrl,
  });
});

router.get("/links/:id/clicks.csv", requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const link = db
    .prepare("SELECT id, code, owner_id FROM links WHERE id = ?")
    .get(id);
  if (!link || link.owner_id !== req.session.user.id)
    return res.status(404).send("Not found");

  const { from, to, humansOnly } = req.query;
  const conditions = ["link_id = ?"];
  const params = [id];
  if (from) {
    conditions.push("date(clicked_at) >= date(?)");
    params.push(from);
  }
  if (to) {
    conditions.push("date(clicked_at) <= date(?)");
    params.push(to);
  }
  if (humansOnly === "1") {
    conditions.push("is_bot = 0");
  }
  const where = "WHERE " + conditions.join(" AND ");

  const rows = db
    .prepare(
      `
    SELECT clicked_at, referer, user_agent, accept_language, is_bot, ip_trunc
    FROM link_clicks ${where}
    ORDER BY id DESC`
    )
    .all(...params);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${link.code}-clicks.csv"`
  );

  const escapeCsv = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = [
    "clicked_at",
    "referer",
    "user_agent",
    "accept_language",
    "is_bot",
    "ip_trunc",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.clicked_at,
      r.referer || "",
      r.user_agent || "",
      r.accept_language || "",
      r.is_bot ? 1 : 0,
      r.ip_trunc || "",
    ]
      .map(escapeCsv)
      .join(",")
  );
  res.send([header, ...lines].join("\n"));
});

router.get("/s/:code", (req, res) => {
  const { code } = req.params;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, url, total_clicks, first_clicked_at FROM links WHERE code = ?"
    )
    .get(code);
  if (!row) return res.status(404).send("Short link not found");
  try {
    const referer = req.get("referer") || null;
    const userAgent = req.get("user-agent") || null;
    const acceptLanguage = req.get("accept-language") || null;
    const ip = getClientIp(req);
    const ipTrunc = anonymizeIp(ip);
    const ipHash = hashIp(ip, process.env.IP_HASH_SALT || "");
    const isBot = detectBot(userAgent) ? 1 : 0;

    const insertClick = db.prepare(`
      INSERT INTO link_clicks (link_id, referer, user_agent, accept_language, is_bot, ip_trunc, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertClick.run(
      row.id,
      referer,
      userAgent,
      acceptLanguage,
      isBot,
      ipTrunc,
      ipHash
    );

    const now = new Date().toISOString();
    const updateAgg = db.prepare(`
      UPDATE links
      SET total_clicks = total_clicks + 1,
          first_clicked_at = COALESCE(first_clicked_at, ?),
          last_clicked_at = ?
      WHERE id = ?
    `);
    updateAgg.run(now, now, row.id);
  } catch (e) {
    // Do not break the redirect due to logging failures
    console.error("Error logging click:", e);
  }
  res.redirect(row.url);
});

module.exports = { linksRouter: router };
