/**
 * Polish crawled HTML for a standalone static site.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://xelaconseil.ca";

async function walk(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "scripts" || ent.name === ".git" || ent.name === "node_modules") continue;
      out.push(...(await walk(p)));
    } else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function depthPrefix(file) {
  const rel = path.relative(ROOT, path.dirname(file)).replace(/\\/g, "/");
  if (!rel || rel === ".") return "./";
  return "../".repeat(rel.split("/").filter(Boolean).length);
}

async function downloadIfMissing(urlPath) {
  const local = path.join(ROOT, urlPath.replace(/^\//, ""));
  try {
    await fs.access(local);
    return;
  } catch {
    /* missing */
  }
  const url = ORIGIN + (urlPath.startsWith("/") ? urlPath : "/" + urlPath);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("MISS", res.status, urlPath);
      return;
    }
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, Buffer.from(await res.arrayBuffer()));
    console.log("DL", urlPath);
  } catch (e) {
    console.warn("ERR", urlPath, e.message);
  }
}

async function fetchBlogMedia() {
  const posts = await (
    await fetch(ORIGIN + "/wp-json/wp/v2/posts?per_page=20&_embed")
  ).json();
  for (const post of posts) {
    const html = post.content?.rendered || "";
    const featured =
      post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
    const urls = new Set();
    if (featured) urls.add(featured);
    for (const m of html.matchAll(/https:\/\/xelaconseil\.ca(\/wp-content\/uploads\/[^"'\\\s]+)/g)) {
      urls.add(ORIGIN + m[1]);
    }
    for (const u of urls) {
      const p = new URL(u).pathname;
      await downloadIfMissing(p);
    }
  }
}

function polishHtml(html, file) {
  const prefix = depthPrefix(file);
  const confirmPath =
    prefix === "./" ? "./confirmation/index.html" : prefix + "confirmation/index.html";

  let out = html;

  // Language
  out = out.replace(/<html\s+lang=["'][^"']*["']/, '<html lang="fr-CA"');
  out = out.replace(/<html([^>]*)>/, (m, attrs) =>
    /lang=/.test(attrs) ? m : `<html lang="fr-CA"${attrs}>`
  );

  // Localize remaining theme/plugin absolute asset URLs
  out = out.replace(
    /https:\/\/xelaconseil\.ca\/(wp-content\/[^"'\\\s]+)/g,
    (_, p) => prefix + p
  );

  // browserconfig
  out = out.replace(
    /content="[^"]*browserconfig\.xml"/,
    `content="${prefix}wp-content/themes/reptile/static/img/icons/browserconfig.xml"`
  );

  // Neutralize WP-only endpoints left in head
  out = out.replace(/<link rel="pingback"[^>]*>/gi, "");
  out = out.replace(/<link rel="author"[^>]*>/gi, "");
  out = out.replace(/<link[^>]+application\/rss\+xml[^>]*>/gi, "");
  out = out.replace(/<link[^>]+oembed[^>]*>/gi, "");
  out = out.replace(/<link rel="https:\/\/api\.w\.org\/"[^>]*>/gi, "");
  out = out.replace(/<link rel="EditURI"[^>]*>/gi, "");
  out = out.replace(/<link rel="alternate"[^>]*wp-json[^>]*>/gi, "");
  out = out.replace(/<meta name="generator"[^>]*>/gi, "");

  // Static form: no AJAX iframe post to WP — go to confirmation
  out = out.replace(
    /<form([^>]*id=['"]gform_1['"][^>]*)>/i,
    `<form method="get" id="gform_1" action="${confirmPath}" data-formid="1" novalidate>`
  );
  // Remove ajax target / onclick that blocks static submit
  out = out.replace(/\s*target=['"]gform_ajax_frame_1['"]/gi, "");
  out = out.replace(
    /onclick=['"]gform\.submission\.handleButtonClick\(this\);['"]/gi,
    ""
  );
  out = out.replace(
    /<input[^>]*name=['"]gform_ajax['"][^>]*>/gi,
    ""
  );

  // Helper script: skip recaptcha gate for local demo submit
  const inject = `
<script>
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('form[id^="gform_"]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      // Allow native navigation to confirmation page
      var btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = false;
    }, true);
  });
  // Upgrade lazy srcset placeholders if theme script misses them
  document.querySelectorAll('img[srcset][sizes="1px"]').forEach(function (img) {
    var src = img.getAttribute('src');
    if (src) {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.setAttribute('src', src);
    }
  });
});
</script>
`;
  if (!out.includes("Upgrade lazy srcset placeholders")) {
    out = out.replace(/<\/body>/i, inject + "\n</body>");
  }

  return out;
}

async function main() {
  await fetchBlogMedia();
  const files = await walk(ROOT);
  for (const file of files) {
    const html = await fs.readFile(file, "utf8");
    const next = polishHtml(html, file);
    await fs.writeFile(file, next, "utf8");
    console.log("polished", path.relative(ROOT, file));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
