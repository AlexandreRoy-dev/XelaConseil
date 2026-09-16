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

const broken = `document.addEventListener('DOMContentLoaded', function () {
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
});`;

const fixed = `document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('img[srcset][sizes="1px"]').forEach(function (img) {
    var src = img.getAttribute('src');
    if (src) {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.setAttribute('src', src);
    }
  });
});`;

for (const file of await walk(ROOT)) {
  const html = await fs.readFile(file, "utf8");
  if (!html.includes(broken)) {
    console.log("skip", path.relative(ROOT, file));
    continue;
  }
  await fs.writeFile(file, html.replace(broken, fixed), "utf8");
  console.log("fixed", path.relative(ROOT, file));
}
