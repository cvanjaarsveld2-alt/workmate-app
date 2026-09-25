export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Stock slate-400 (#94A3B8) is 2.6:1 on white, hard to read outdoors
        // on a phone. Used for most secondary text, so darken it to 4:1.
        // Dark mode remaps text-slate-400 separately (darkMode.css).
        slate: { 400: "#737F92" },
      },
    },
  },
  plugins: [],
};
