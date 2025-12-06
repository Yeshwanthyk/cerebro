/**
 * ESLint config - TYPE-AWARE rules only
 * oxlint handles non-type-aware rules (faster)
 * ESLint handles rules requiring type information
 */
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["dist/**", "node_modules/**", "*.config.*"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // ===========================================
      // Type Safety - Block any escape hatches
      // These require type information (can't be in oxlint)
      // ===========================================
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",

      // ===========================================
      // Promise & Async - Require type information
      // ===========================================
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/return-await": ["error", "in-try-catch"],

      // ===========================================
      // Nullish coalescing - Requires type info
      // ===========================================
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      // ===========================================
      // Strict boolean expressions
      // ===========================================
      "@typescript-eslint/strict-boolean-expressions": [
        "warn",
        {
          allowString: true,
          allowNumber: true,
          allowNullableObject: true,
        },
      ],
    },
  },
];
