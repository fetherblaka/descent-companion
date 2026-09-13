import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "_site/"] },
  js.configs.recommended,
  {
    // moduli ES dell'app
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
];
