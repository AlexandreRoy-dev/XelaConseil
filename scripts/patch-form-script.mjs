import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["scripts", ".git", "node_modules", "vps", "js"].includes(ent.name)) continue;
      out.push(...(await walk(p)));
    } else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function prefixFor(file) {
  const rel = path.relative(ROOT, path.dirname(file)).replace(/\\/g, "/");
  if (!rel || rel === ".") return "./";
  return "../".repeat(rel.split("/").filter(Boolean).length);
}

const files = await walk(ROOT);
for (const file of files) {
  let html = await fs.readFile(file, "utf8");
  const prefix = prefixFor(file);
  const tag = `<script src="${prefix}js/form-to-client.js" defer></script>`;
  if (!html.includes("js/form-to-client.js")) {
    html = html.replace(/<\/body>/i, `${tag}\n</body>`);
  }
  html = html.replace(
    /document\.querySelectorAll\('form\[id\^="gform_"\]'\)[\s\S]*?\}, true\);\s*/g,
    ""
  );
  await fs.writeFile(file, html, "utf8");
  console.log("patched", path.relative(ROOT, file));
}
