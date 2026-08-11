# Xela Conseil — static site

Static 1:1 mirror of [xelaconseil.ca](https://xelaconseil.ca/), rebuilt from the live WordPress front-end (theme assets, uploads, and page HTML).

## Pages

- `/` — Accueil
- `/services/`
- `/carrieres/`
- `/blogue/`
- `/politique-de-confidentialite/`
- `/confirmation/`
- Blog posts under their original slugs

## Local preview

```bash
npx --yes serve -l 4173 .
```

Then open http://localhost:4173

## Notes

- Visual/layout parity uses the original Reptile theme CSS/JS and media.
- Gravity Forms markup is preserved for look & feel; submit navigates to the local confirmation page (no WordPress backend).
- Google Fonts (DM Sans / DM Serif Display) load from Google CDN.
- Re-crawl: `node scripts/crawl-site.mjs` (writes to `site/`), copy contents to repo root, then `node scripts/polish-static.mjs`

## Deploy (GitHub Pages)

Enable Pages on this repo with source = Deploy from branch → `main` / root (or `/docs` if you prefer). No build step required.
