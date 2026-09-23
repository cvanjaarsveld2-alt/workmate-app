export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Descriptions and secondary text use slate-400/500. The stock shades were
        // 2.6:1 and 4.3:1 on the app's backgrounds (WCAG AA needs 4.5:1), which
        // made most descriptive text hard to read, especially outdoors. These keep
        // the same light-to-dark order but pass AA on white, #F7F3F3, slate-50/100.
        // Dark mode maps these classes separately (src/darkMode.css).
        slate: { 400: "#5E6A7C", 500: "#536072" },
        // "Headframe" palette: graphite steel, warm stone, hi-vis amber (sparingly).
        graphite: { 700: "#2A2E34", 800: "#1D2024", 900: "#15171A" },
        hivis: "#F2A900",
      },
      fontFamily: {
        sans: ["Barlow", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Barlow Condensed", "Barlow", "system-ui", "sans-serif"],
      },
      // Tighter, machined corners instead of soft consumer-app pills.
      borderRadius: { xl: "0.625rem", "2xl": "0.75rem", "3xl": "1rem" },
    },
  },
  plugins: [],
};
