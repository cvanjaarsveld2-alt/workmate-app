// Before building the iPhone/Android app: links that leave the phone
// (customer portal, quotes, invites, QR labels) need the public website's
// address. Set VITE_PUBLIC_APP_URL (e.g. https://app.yourproduct.co.za).
// NATIVE_TEST_BUILD=1 allows a test build without it (links then won't work).
const url = process.env.VITE_PUBLIC_APP_URL || "";
if (!/^https:\/\/[^/]+/.test(url) && process.env.NATIVE_TEST_BUILD !== "1") {
  console.error("Set VITE_PUBLIC_APP_URL to your website (https://…) before building the store apps.");
  process.exit(1);
}
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the same as the website's).");
  process.exit(1);
}
console.log(`Native build for ${url || "(test build: no public URL)"}`);
