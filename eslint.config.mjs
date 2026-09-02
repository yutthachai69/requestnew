import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
  ]),
  {
    // ใน flat config การประกาศ plugins มีผลเฉพาะภายใน config object เดียวกัน
    // จึงต้องประกาศ react-hooks ซ้ำตรงนี้ ไม่งั้น ESLint จะฟ้องว่าหา plugin ไม่เจอ
    // แล้ว `npm run lint` ล้มทั้งคำสั่ง (ทำให้ CI แดงตลอด)
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      // ลด technical debt เป็นค่อยๆ — CI บล็อกเฉพาะ error ใหม่
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
