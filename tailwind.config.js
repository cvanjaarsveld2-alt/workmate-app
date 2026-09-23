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
        slate: { 400: "#647083", 500: "#536072" },
      },
    },
  },
  plugins: [],
};
