# Website and user manual

The public website (home page, pricing) and the user manual, built as plain HTML
pages. Search engines and AI assistants can read them without running any
scripts. The app itself lives at a separate address and tells search engines to
stay out.

```
site/
  config.mjs          product name, addresses, contact details, plans and prices
  build.mjs           builds everything into site/dist
  src/layout.mjs      head, header and footer shared by every page
  src/pages/          home.mjs, pricing.mjs, manual.mjs (all chapters)
  assets/style.css
  img/                app screenshots (demo company), og.png link preview, icon
```

## Build and look at it

```
node site/build.mjs
cd site/dist && python3 -m http.server 4300    # open http://localhost:4300
```

`npm test` builds the site and checks that every link and picture works.

## Refresh the screenshots

After the app's screens change:

```
node tests/sim/site-shots.cjs
```

It builds the app, opens each screen with the fictional demo company (Acme
Hydraulics) at iPhone size, and saves `site/img/app-*.webp` and `site/img/og.png`.
It never uses real customer data. The screens are listed at the top of the script.

## Publish it (Vercel, about 10 minutes)

1. In Vercel, **Add New → Project**, and import this repository again. It becomes a
   second project next to the app.
2. Set **Root Directory** to `site`. The build settings come from `site/vercel.json`.
3. Under **Environment Variables**, add:

   | Name | Example | What it's for |
   |---|---|---|
   | `SITE_URL` | `https://www.yourproduct.co.za` | The website's own address: canonical links, sitemap, link previews |
   | `APP_URL` | `https://app.yourproduct.co.za` | Where Sign in and Start free trial go. Defaults to the current app address |
   | `CONTACT_EMAIL` | `hello@yourproduct.co.za` | Shows "Email us" buttons. Leave it out to hide them |
   | `CONTACT_WHATSAPP` | `27821234567` | Shows "WhatsApp us" buttons. Leave it out to hide them |
   | `PRODUCT_NAME` | `PowerMate` | If you rename the product |

4. Deploy. Then, under **Domains**, add your domain, for example `www.yourproduct.co.za`.
5. In [Google Search Console](https://search.google.com/search-console), add the
   domain and submit `https://www.yourproduct.co.za/sitemap.xml`.

## Before you share it

- **Sign-up**: the app only lets people sign up with an allowed email domain, an
  invite link or a sign-up code. For "Start free trial" to work for anyone,
  switch sign-up to **Open** in the app under Settings → Platform → Sign-up, or
  give prospects a sign-up code.
- **Prices**: `config.mjs` has the same plans and prices as Settings → Platform →
  Plans. Change both together.
- **The app's address**: when the app moves to its own domain, set
  `APP_URL` here, `VITE_MANUAL_URL` in the app project, and the Supabase
  redirect URLs (see docs/EMAIL_SETUP.md).
