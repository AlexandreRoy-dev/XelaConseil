import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nodemailer = require("nodemailer");

const root = dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(join(root, ".env"));

const PORT = Number(process.env.PORT || 8791);
const HOST = process.env.HOST || "127.0.0.1";
const EMAIL_TO = (process.env.EMAIL_TO || "info@xelaconseil.ca")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.SMTP_USER || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";
const SMTP_USE_TLS = String(process.env.SMTP_USE_TLS || "true").toLowerCase() !== "false";

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  [
    "https://xelaconseil.ca",
    "https://www.xelaconseil.ca",
    "https://alexandreroy-dev.github.io",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ].join(",")
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const recent = new Map();

function cors(origin) {
  const allow = !origin || ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allow ? origin || ALLOWED_ORIGINS[0] : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(res, status, body, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...cors(origin),
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRateLimited(ip) {
  const now = Date.now();
  const stamps = (recent.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
  stamps.push(now);
  recent.set(ip, stamps);
  return stamps.length > 8;
}

function rowsFromPayload(payload) {
  const labels = [
    ["form", "Formulaire"],
    ["prenom", "Prénom"],
    ["nom", "Nom"],
    ["courriel", "Courriel"],
    ["telephone", "Téléphone"],
    ["entreprise", "Entreprise"],
    ["chiffreAffaires", "Chiffre d’affaires"],
    ["employes", "Nombre d’employés"],
    ["vousEtes", "Vous êtes"],
    ["source", "Comment avez-vous entendu parler de nous"],
    ["message", "Message"],
    ["utm_source", "UTM source"],
    ["utm_medium", "UTM medium"],
    ["utm_campaign", "UTM campaign"],
    ["page", "Page"],
  ];
  return labels
    .map(([key, label]) => {
      const value = clean(payload[key]);
      return value ? [label, value] : null;
    })
    .filter(Boolean);
}

function buildEmail(payload) {
  const kind = payload.form === "career" ? "candidature" : "rendez-vous";
  const name = [clean(payload.prenom), clean(payload.nom)].filter(Boolean).join(" ") || "Sans nom";
  const rows = rowsFromPayload(payload);
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #eee;width:38%">${escapeHtml(
          label
        )}</th><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(
          value
        ).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");

  return {
    subject: `Nouveau ${kind} — ${name} — site Xela Conseil`,
    text,
    html: `<p>Un visiteur a soumis le formulaire ${escapeHtml(
      kind
    )} sur le site Xela Conseil.</p><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:15px/1.4 system-ui,sans-serif">${htmlRows}</table>`,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_USE_TLS && SMTP_PORT !== 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  });
}

function decodeAttachment(payload) {
  const name = clean(payload.cvName);
  const data = String(payload.cvBase64 || "");
  if (!name || !data) return null;
  if (data.length > 7_000_000) return null;
  return {
    filename: name.replace(/[^\w.\- ()àâäéèêëïîôùûüç]+/gi, "_").slice(0, 120),
    content: Buffer.from(data, "base64"),
  };
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors(origin));
    res.end();
    return;
  }

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/xela/health")) {
    json(
      res,
      200,
      {
        ok: true,
        configured: Boolean(SMTP_HOST && EMAIL_FROM && EMAIL_TO.length),
      },
      origin
    );
    return;
  }

  if (req.method !== "POST" || (url.pathname !== "/xela" && url.pathname !== "/api/xela")) {
    json(res, 404, { ok: false, error: "Not found" }, origin);
    return;
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    json(res, 403, { ok: false, error: "Origin not allowed" }, origin);
    return;
  }

  const ip = String(req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown");
  if (isRateLimited(ip)) {
    json(res, 429, { ok: false, error: "Too many requests" }, origin);
    return;
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch {
    json(res, 400, { ok: false, error: "Invalid JSON" }, origin);
    return;
  }

  if (clean(payload.website) || clean(payload.honeypot)) {
    json(res, 200, { ok: true, ignored: true }, origin);
    return;
  }

  const prenom = clean(payload.prenom);
  const nom = clean(payload.nom);
  const courriel = clean(payload.courriel);
  const telephone = clean(payload.telephone);
  const message = clean(payload.message);

  if (!prenom || !nom) {
    json(res, 400, { ok: false, error: "Nom requis" }, origin);
    return;
  }
  if (!isEmail(courriel)) {
    json(res, 400, { ok: false, error: "Courriel invalide" }, origin);
    return;
  }
  if (telephone.replace(/\D/g, "").length < 10) {
    json(res, 400, { ok: false, error: "Téléphone invalide" }, origin);
    return;
  }
  if (payload.form !== "career" && !message) {
    json(res, 400, { ok: false, error: "Message requis" }, origin);
    return;
  }
  if (!SMTP_HOST || !EMAIL_FROM || !EMAIL_TO.length) {
    json(res, 500, { ok: false, error: "Server not configured" }, origin);
    return;
  }

  const email = buildEmail({ ...payload, prenom, nom, courriel, telephone, message });
  const attachment = decodeAttachment(payload);

  try {
    await transporter().sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      replyTo: courriel,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: attachment ? [attachment] : undefined,
    });
    json(res, 200, { ok: true }, origin);
  } catch (error) {
    console.error("mail_failed", error && error.message);
    json(res, 502, { ok: false, error: "Send failed" }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Xela form mail: http://${HOST}:${PORT}/xela`);
});
