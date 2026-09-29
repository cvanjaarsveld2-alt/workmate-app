// Page shell shared by every page: head (title, description, canonical, link
// previews, structured data), header, footer.
import { config } from "../config.mjs";

export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const rand = n => "R" + Number(n).toLocaleString("en-ZA").replace(/,/g, " ");
export const signupUrl = () => `${config.appUrl}/?signup=1`;
export const signinUrl = () => config.appUrl;

// A phone-sized screenshot of the app. Every picture shows the fictional demo
// company, never real customers.
export const shot = (name, alt, { eager = false, cls = "" } = {}) =>
  `<figure class="phone ${cls}"><img src="/img/app-${name}.webp" width="390" height="844" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></figure>`;

export function contactButtons(cls = "btn btn-ghost") {
  const out = [];
  if (config.whatsapp) out.push(`<a class="${cls}" href="https://wa.me/${config.whatsapp}?text=${encodeURIComponent(`Hi, I'd like to see a demo of ${config.product}.`)}">WhatsApp us</a>`);
  if (config.contactEmail) out.push(`<a class="${cls}" href="mailto:${esc(config.contactEmail)}?subject=${encodeURIComponent(`${config.product} demo`)}">Email us</a>`);
  return out.join("");
}

const NAV = [
  ["/#features", "Features"],
  ["/pricing/", "Pricing"],
  ["/manual/", "Manual"],
];

export function page({ path, title, description, body, jsonld = [], section = "", noindex = false }) {
  const url = config.siteUrl + path;
  const fullTitle = path === "/" ? title : `${title} | ${config.product}`;
  const ld = jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n");
  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.product)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(config.siteUrl)}/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#8B1A1A">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/"><img src="/img/icon.svg" width="28" height="28" alt=""><span>${esc(config.product)}</span></a>
    <nav aria-label="Main">
      ${NAV.map(([href, label]) => `<a href="${href}"${section === label ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
    </nav>
    <div class="bar-actions">
      <a class="link-signin" href="${esc(signinUrl())}">Sign in</a>
      <a class="btn btn-primary btn-sm" href="${esc(signupUrl())}">Start free trial</a>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="brand" href="/"><img src="/img/icon.svg" width="24" height="24" alt=""><span>${esc(config.product)}</span></a>
      <p class="muted">Quotes, jobs, invoices and your team on one phone app. Built in South Africa for industrial service teams.</p>
    </div>
    <div>
      <h2>Product</h2>
      <a href="/#features">Features</a>
      <a href="/pricing/">Pricing</a>
      <a href="/#offline">Works offline</a>
      <a href="/#faq">Questions</a>
    </div>
    <div>
      <h2>Help</h2>
      <a href="/manual/">User manual</a>
      <a href="/manual/getting-started/">Getting started</a>
      <a href="/manual/faq/">Troubleshooting</a>
      ${config.contactEmail ? `<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>` : ""}
    </div>
    <div>
      <h2>Legal</h2>
      <a href="${esc(config.appUrl)}/?legal=terms">Terms</a>
      <a href="${esc(config.appUrl)}/?legal=privacy">Privacy (POPIA)</a>
      <a href="${esc(config.appUrl)}/?legal=dpa">Data processing</a>
    </div>
  </div>
  <div class="wrap fine">© ${new Date().getFullYear()} ${esc(config.product)}. Screenshots show a fictional demo company.</div>
</footer>
</body>
</html>
`;
}
