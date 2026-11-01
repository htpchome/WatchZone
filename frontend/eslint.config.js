import eslint from "@eslint/js";
import lit from "eslint-plugin-lit";
import wc from "eslint-plugin-wc";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["coverage/", "dist/", "playwright-report/", "test-results/"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  lit.configs["flat/recommended"],
  wc.configs["flat/recommended"],
  {
    files: ["src/**/*.ts"],
    ignores: ["src/core/client-environment.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["maxTouchPoints", "platform", "userAgent", "userAgentData"].map(
          (property) => ({
            selector: `MemberExpression[property.name='${property}']`,
            message:
              "Physical client detection is owned only by ClientEnvironment.",
          }),
        ),
      ],
    },
  },
);
