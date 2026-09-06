/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    // STRICT: Empty catch blocks mask test failures. They MUST be replaced with
    // expectApiError from tests/helpers/api-expect.ts OR be explicitly justified
    // with an inline eslint-disable comment that includes a justification.
    // Note: no-empty-catch was merged into no-empty; use allowEmptyCatch: false
    "no-empty": ["error", { allowEmptyCatch: false }],
    // Allow existing `any` usage in tests (downgrade from error to warn to avoid
    // blocking the lint pass on pre-existing code; tightening is a separate task).
    "@typescript-eslint/no-explicit-any": "warn",
    // Tests use lots of unused vars for fixtures — relax
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  ignorePatterns: ["dist/", "node_modules/", "src/generated/"],
};
