const tsParser = require("@typescript-eslint/parser")
const tsPlugin = require("@typescript-eslint/eslint-plugin")

module.exports = [
  {
    ignores: ["dist/**", "docs/api/**", "node_modules/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/naming-convention": [
        "error",
        // Types
        { selector: "typeLike", format: ["PascalCase"] },

        // React components are functions, so allow PascalCase too.
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },

        // Don't enforce naming for external payload keys / headers / CSS vars, etc.
        { selector: "objectLiteralProperty", format: null },
        { selector: "typeProperty", format: null },
      ],
    },
  },
]
