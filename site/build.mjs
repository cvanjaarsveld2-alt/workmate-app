// Builds the public website and user manual into site/dist as plain HTML:
// fast, readable by search engines and AI assistants without running scripts.
//   node site/build.mjs            (SITE_URL, APP_URL etc.: see config.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { esc, page } from "./src/layout.mjs";
import * as home from "./src/pages/home.mjs";
import * as pricing from "./src/pages/pricing.mjs";
import { CHAPTERS, chapterPage, manualIndex } from "./src/pages/manual.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.env.SITE_OUT || path.join(ROOT, "dist"));

const pages = [
  { ...home.meta, body: home.body(), jsonld: home.jsonld(), priority: "1.0" },
  { ...pricing.meta, body: pricing.body(), jsonld: pricing.jsonld(), section: "Pricing", priority: "0.9" },
  { ...manualIndex, body: manualIndex.body(), section: "Manual", priority: "0.8" },
  ...CHAPTERS.map((_, i) => {
    const c = chapterPage(i);
    return { ...c, body: c.body(), section: "Manual", priority: "0.6" };
  }),
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

for (const p of pages) write(path.join(p.path, "index.html"), page(p));

write(
  "404.html",
  page({
    path: "/404.html",
    title: "Page not found",
    description: "This page doesn't exist. Go to the home page or the user manual to find what you're looking for.",
    noindex: true,
    body: `<section class="hero"><div class="wrap center"><h1>Page not found</h1><p class="lede" style="margin:0 auto 24px">That page doesn't exist, or it has moved.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="/">Home</a><a class="btn btn-ghost" href="/manual/">User manual</a></div></div></section>`,
  }),
);

fs.copyFileSync(path.join(ROOT, "assets", "style.css"), path.join(OUT, "style.css"));
fs.cpSync(path.join(ROOT, "img"), path.join(OUT, "img"), { recursive: true });

const today = new Date().toISOString().slice(0, 10);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${esc(config.siteUrl + p.path)}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>
`,
);

// Search engines and AI assistants are welcome here; the app itself (a
// separate address) tells them to stay out.
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);

// A plain-text map of the site for AI assistants (llmstxt.org).
write(
  "llms.txt",
  `# ${config.product}

> ${home.meta.description}

${config.product} is a mobile-first field service app for industrial service companies in South Africa (mining, hydraulics, plant and machine servicing). It covers customers, quotes accepted online, jobs and job cards, scheduling, timesheets, products and stock, purchase orders, invoices with online payment, expenses with receipt scanning, an equipment register with QR labels, forms and checklists, service plans and job profit. It works offline and syncs when back in signal.

Pricing per company per month: ${config.plans.map(p => `${p.name} R${p.price} (${p.users.toLowerCase()})`).join(", ")}. Free ${config.trialDays}-day trial.

## Pages
- [Home](${config.siteUrl}/): what ${config.product} does
- [Pricing](${config.siteUrl}/pricing/): plans and what each includes

## User manual
${CHAPTERS.map(c => `- [${c.title}](${config.siteUrl}/manual/${c.slug}/): ${c.description}`).join("\n")}
`,
);

console.log(`Built ${pages.length} pages into ${path.relative(process.cwd(), OUT) || OUT} for ${config.siteUrl} (app: ${config.appUrl})`);
