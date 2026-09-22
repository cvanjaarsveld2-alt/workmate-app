// Lint for bugs, not style: undefined names/components, hook misuse, dead or
// duplicate code. Formatting is Prettier's job.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "supabase/functions/**", "src/lib/pwLogo.js"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-key": "warn",
      "react/no-direct-mutation-state": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["public/service-worker.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
    rules: { ...js.configs.recommended.rules, "no-empty": "off" },
  },
];
