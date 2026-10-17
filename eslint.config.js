import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
      "docs/**",
      "coverage/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["src/server/**/*.ts", "scripts/**/*.mjs", "tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.worker },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
    },
  },
);
