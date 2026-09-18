import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,jsx}"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { window:"readonly", document:"readonly", navigator:"readonly", localStorage:"readonly", sessionStorage:"readonly", console:"readonly", crypto:"readonly", File:"readonly", Blob:"readonly", FileReader:"readonly", URL:"readonly", Image:"readonly", atob:"readonly", btoa:"readonly", fetch:"readonly", setTimeout:"readonly", setInterval:"readonly", clearTimeout:"readonly", clearInterval:"readonly", structuredClone:"readonly" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  }
];
