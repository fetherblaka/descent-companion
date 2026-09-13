import js from "@eslint/js";
import html from "eslint-plugin-html";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "_site/"] },
  js.configs.recommended,
  {
    // lo script inline di index.html
    files: ["**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, firebase: "readonly" },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
];
