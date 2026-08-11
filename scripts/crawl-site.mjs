/**
 * Crawl xelaconseil.ca into a local static mirror with rewritten asset paths.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "site");
const ORIGIN = "https://xelaconseil.ca";

const PAGES = [
  "/",
  "/services/",
  "/blogue/",
  "/carrieres/",
  "/politique-de-confidentialite/",
  "/confirmation/",
  "/derriere-la-croissance-de-wecook-une-pincee-de-xela-conseil-cpa/",
  "/entreprendre-3-principes-pour-partir-du-bon-pied/",
];

const EXTRA_ASSETS = [
  "/wp-content/themes/reptile/static/dist/app.min.css",
  "/wp-content/themes/reptile/static/dist/app.min.js",
  "/wp-content/themes/reptile/style.css",
  "/wp-content/themes/reptile/humans.txt",
  "/wp-content/themes/reptile/static/js/libs/jquery-3.3.1.min.js",
  "/wp-content/themes/reptile/static/js/libs/polyfill.js",
  "/wp-content/themes/reptile/static/js/libs/polyfill-ie11.js",
  "/wp-content/themes/reptile/static/js/libs/TweenMax.min.js",
  "/wp-content/themes/reptile/static/js/libs/rep.dropdown.js",
  "/wp-content/themes/reptile/static/js/libs/rep.select-to-dropdown.js",
  "/wp-content/themes/reptile/static/img/icons/apple-touch-icon.png",
  "/wp-content/themes/reptile/static/img/icons/favicon.ico",
  "/wp-content/themes/reptile/static/img/icons/favicon-16x16.png",
  "/wp-content/themes/reptile/static/img/icons/favicon-32x32.png",
  "/wp-content/themes/reptile/static/img/icons/safari-pinned-tab.svg",
  "/wp-content/themes/reptile/static/img/icons/site.webmanifest",
  "/wp-content/themes/reptile/static/img/icons/browserconfig.xml",
  "/wp-content/themes/reptile/static/img/CPA.png",
  "/wp-content/themes/reptile/static/img/footer-top-section.png",
  "/wp-content/themes/reptile/static/img/line_diagnosis.svg",
  "/wp-content/themes/reptile/static/img/line_execution.svg",
  "/wp-content/themes/reptile/static/img/line_meet.svg",
  "/wp-content/themes/reptile/static/img/line_method.svg",
  "/wp-content/themes/reptile/static/img/line_plan.svg",
  "/wp-content/themes/reptile/static/img/logo.png",
  "/wp-content/themes/reptile/static/img/logo-white.png",
  "/wp-content/themes/reptile/static/img/shape-02.svg",
  "/wp-content/themes/reptile/static/img/quote-bg.jpg",
  "/wp-content/themes/reptile/static/fonts/fa-brands-400.woff2",
  "/wp-content/themes/reptile/static/fonts/fa-brands-400.woff",
  "/wp-content/themes/reptile/static/fonts/fa-brands-400.ttf",
  "/wp-content/themes/reptile/static/fonts/fa-duotone-900.woff2",
  "/wp-content/themes/reptile/static/fonts/fa-duotone-900.woff",
  "/wp-content/themes/reptile/static/fonts/fa-duotone-900.ttf",
  "/wp-content/themes/reptile/static/fonts/fa-light-300.woff2",
  "/wp-content/themes/reptile/static/fonts/fa-light-300.woff",
  "/wp-content/themes/reptile/static/fonts/fa-light-300.ttf",
  "/wp-content/themes/reptile/static/fonts/fa-regular-400.woff2",
  "/wp-content/themes/reptile/static/fonts/fa-regular-400.woff",
  "/wp-content/themes/reptile/static/fonts/fa-regular-400.ttf",
  "/wp-content/themes/reptile/static/fonts/fa-solid-900.woff2",
  "/wp-content/themes/reptile/static/fonts/fa-solid-900.woff",
  "/wp-content/themes/reptile/static/fonts/fa-solid-900.ttf",
];

const queue = new Set();
const downloaded = new Map(); // url -> local relative path from OUT
const failed = [];

function normalizeUrl(raw, base = ORIGIN) {
  if (!raw) return null;
  let u = raw.trim();
  if (
    u.startsWith("data:") ||
    u.startsWith("mailto:") ||
    u.startsWith("tel:") ||
    u.startsWith("javascript:") ||
    u.startsWith("#") ||
    u.startsWith("about:")
  ) {
    return null;
  }
  // protocol-relative
  if (u.startsWith("//")) u = "https:" + u;
  try {
    const url = new URL(u, base);
    if (url.origin !== ORIGIN) return null;
    // strip hash
    url.hash = "";
    // strip common cache busters for file path, keep for fetch
    return url.href;
  } catch {
    return null;
  }
}

function urlToLocalPath(href) {
  const url = new URL(href);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  if (p === "/") p = "/index.html";
  // page paths without extension
  if (!path.extname(p) && !p.endsWith("index.html")) {
    // treat as directory index if it's a known page-like path
    if (!p.includes(".")) p = p.replace(/\/?$/, "/") + "index.html";
  }
  // strip query from filename
  return p.replace(/^\//, "");
}

function fetchUrl(href) {
  const url = new URL(href);
  // keep query for WP assets that need it sometimes, but prefer clean
  return fetch(url.href, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; XelaStaticMirror/1.0; +local-dev)",
      Accept: "*/*",
    },
    redirect: "follow",
  });
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function saveAsset(href) {
  const clean = normalizeUrl(href);
  if (!clean) return null;
  if (downloaded.has(clean)) return downloaded.get(clean);

  const localRel = urlToLocalPath(clean);
  const localAbs = path.join(OUT, localRel);
  downloaded.set(clean, localRel);

  try {
    const res = await fetchUrl(clean);
    if (!res.ok) {
      failed.push({ href: clean, status: res.status });
      downloaded.delete(clean);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await ensureDir(localAbs);
    await fs.writeFile(localAbs, buf);
    console.log("OK", res.status, localRel);

    const ctype = res.headers.get("content-type") || "";
    if (
      ctype.includes("text/css") ||
      localRel.endsWith(".css") ||
      ctype.includes("text/html") ||
      localRel.endsWith(".html") ||
      localRel.endsWith(".js") ||
      ctype.includes("javascript")
    ) {
      const text = buf.toString("utf8");
      extractRefs(text, clean).forEach((r) => queue.add(r));
      if (ctype.includes("text/html") || localRel.endsWith(".html")) {
        return { localRel, text, isHtml: true, source: clean };
      }
      if (ctype.includes("text/css") || localRel.endsWith(".css")) {
        const rewritten = rewriteCss(text, clean);
        await fs.writeFile(localAbs, rewritten, "utf8");
      }
    }
    return localRel;
  } catch (err) {
    failed.push({ href: clean, error: String(err) });
    downloaded.delete(clean);
    return null;
  }
}

function extractRefs(text, baseHref) {
  const refs = new Set();
  const patterns = [
    /(?:href|src)=["']([^"']+)["']/gi,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    /srcset=["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      if (re.source.includes("srcset")) {
        m[1].split(",").forEach((part) => {
          const u = part.trim().split(/\s+/)[0];
          const n = normalizeUrl(u, baseHref);
          if (n) refs.add(n);
        });
      } else {
        const n = normalizeUrl(m[1], baseHref);
        if (n) refs.add(n);
      }
    }
  }
  return refs;
}

function rewriteUrlInText(absHref, fromHtmlPath) {
  if (!downloaded.has(absHref)) {
    // try without query
    const u = new URL(absHref);
    u.search = "";
    if (downloaded.has(u.href)) absHref = u.href;
    else return null;
  }
  const targetRel = downloaded.get(absHref);
  const fromDir = path.posix.dirname(fromHtmlPath.replace(/\\/g, "/"));
  let rel = path.posix.relative(fromDir === "." ? "" : fromDir, targetRel);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function rewriteCss(css, cssHref) {
  const cssLocal = urlToLocalPath(cssHref);
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, raw) => {
    if (raw.startsWith("data:") || raw.startsWith("#")) return full;
    const abs = normalizeUrl(raw, cssHref);
    if (!abs) return full; // external e.g. google fonts kept
    const rewritten = rewriteUrlInText(abs, cssLocal);
    if (!rewritten) {
      // queue for later; keep original absolute local-ish path
      queue.add(abs);
      const guess = path.posix.relative(
        path.posix.dirname(cssLocal),
        urlToLocalPath(abs)
      );
      return `url(${q}${guess}${q})`;
    }
    return `url(${q}${rewritten}${q})`;
  });
}

function rewriteHtml(html, pageHref) {
  const pageLocal = urlToLocalPath(pageHref);

  // Remove WP admin bar / analytics scripts optionally keep structure
  let out = html;

  // Rewrite href/src to local
  out = out.replace(
    /(href|src)=["']([^"']+)["']/gi,
    (full, attr, raw) => {
      const abs = normalizeUrl(raw, pageHref);
      if (!abs) {
        // keep external / anchors / tel
        if (raw.startsWith("/") && !raw.startsWith("//")) {
          const a = normalizeUrl(ORIGIN + raw, pageHref);
          if (a) {
            const r = rewriteUrlInText(a, pageLocal) || raw;
            return `${attr}="${r}"`;
          }
        }
        return full;
      }
      // Internal page links: map to local folders
      const u = new URL(abs);
      const isPage =
        !u.pathname.includes(".") ||
        u.pathname.endsWith("/") ||
        PAGES.includes(u.pathname) ||
        PAGES.includes(u.pathname.replace(/\/?$/, "/"));
      let target = abs;
      if (isPage && !path.extname(u.pathname)) {
        const p = u.pathname.endsWith("/") ? u.pathname : u.pathname + "/";
        target = ORIGIN + (p === "//" ? "/" : p);
        if (p === "/") target = ORIGIN + "/";
      }
      // Prefer downloaded key without query for pages
      const noQ = new URL(target);
      noQ.search = "";
      const key = downloaded.has(noQ.href)
        ? noQ.href
        : downloaded.has(target)
          ? target
          : abs;
      const r = rewriteUrlInText(key, pageLocal);
      if (!r) return full;
      return `${attr}="${r}"`;
    }
  );

  // srcset
  out = out.replace(/srcset=["']([^"']+)["']/gi, (full, srcset) => {
    const parts = srcset.split(",").map((part) => {
      const bits = part.trim().split(/\s+/);
      const abs = normalizeUrl(bits[0], pageHref);
      if (!abs) return part.trim();
      const r = rewriteUrlInText(abs, pageLocal);
      if (!r) return part.trim();
      return [r, ...bits.slice(1)].join(" ");
    });
    return `srcset="${parts.join(", ")}"`;
  });

  // url() in inline styles
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, raw) => {
    const abs = normalizeUrl(raw, pageHref);
    if (!abs) return full;
    const r = rewriteUrlInText(abs, pageLocal);
    if (!r) return full;
    return `url(${q}${r}${q})`;
  });

  // Point Google Fonts stay as CDN (fine for static)
  // Neutralize form action to local confirmation for static demo
  out = out.replace(
    /action=["']https:\/\/xelaconseil\.ca\/[^"']*["']/gi,
    `action="./confirmation/index.html"`
  );

  // Fix homepage form action relative from nested pages
  if (pageLocal !== "index.html") {
    out = out.replace(
      /action=["']\.\/confirmation\/index\.html["']/gi,
      `action="${path.posix.relative(path.posix.dirname(pageLocal), "confirmation/index.html")}"`
    );
  }

  return out;
}

async function processQueue() {
  while (queue.size) {
    const batch = [...queue];
    queue.clear();
    for (const href of batch) {
      // skip feeds, wp-json, xmlrpc for mirror cleanliness but keep visual assets
      if (
        href.includes("/feed") ||
        href.includes("/wp-json") ||
        href.includes("xmlrpc") ||
        href.includes("/comments/")
      ) {
        continue;
      }
      await saveAsset(href);
    }
  }
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  EXTRA_ASSETS.forEach((p) => queue.add(ORIGIN + p));

  const htmlPages = [];

  for (const page of PAGES) {
    const href = ORIGIN + (page === "/" ? "/" : page);
    // Ensure page maps to index.html path
    const pageUrl = href.endsWith("/") || page === "/" ? href : href + "/";
    console.log("\n=== PAGE", pageUrl, "===");
    const res = await fetchUrl(pageUrl);
    if (!res.ok) {
      failed.push({ href: pageUrl, status: res.status });
      continue;
    }
    let html = await res.text();
    const localRel =
      page === "/" ? "index.html" : page.replace(/^\//, "").replace(/\/?$/, "/") + "index.html";
    downloaded.set(pageUrl, localRel);
    downloaded.set(ORIGIN + page.replace(/\/?$/, "/"), localRel);
    if (page === "/") {
      downloaded.set(ORIGIN + "/", "index.html");
      downloaded.set(ORIGIN, "index.html");
    }

    extractRefs(html, pageUrl).forEach((r) => queue.add(r));
    htmlPages.push({ pageUrl, localRel, html });
  }

  await processQueue();

  // Second pass: rewrite CSS now that fonts exist
  for (const [href, localRel] of downloaded) {
    if (!localRel.endsWith(".css")) continue;
    const abs = path.join(OUT, localRel);
    try {
      const css = await fs.readFile(abs, "utf8");
      extractRefs(css, href).forEach((r) => queue.add(r));
    } catch {
      /* ignore */
    }
  }
  await processQueue();

  // Rewrite CSS again with resolved assets
  for (const [href, localRel] of downloaded) {
    if (!localRel.endsWith(".css")) continue;
    const abs = path.join(OUT, localRel);
    try {
      const css = await fs.readFile(abs, "utf8");
      await fs.writeFile(abs, rewriteCss(css, href), "utf8");
    } catch {
      /* ignore */
    }
  }

  // Write rewritten HTML
  for (const { pageUrl, localRel, html } of htmlPages) {
    const rewritten = rewriteHtml(html, pageUrl);
    const abs = path.join(OUT, localRel);
    await ensureDir(abs);
    await fs.writeFile(abs, rewritten, "utf8");
    console.log("HTML", localRel);
  }

  // Root convenience: copy key theme assets note
  const report = {
    pages: htmlPages.map((p) => p.localRel),
    assets: downloaded.size,
    failed,
  };
  await fs.writeFile(
    path.join(ROOT, "crawl-report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log("\nDone. Assets:", downloaded.size, "Failed:", failed.length);
  if (failed.length) console.log(failed.slice(0, 30));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
