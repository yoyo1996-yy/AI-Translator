import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".npm-cache/**",
      ".fc-build/**",
      "android/**",
      "deploy/aliyun-fc/package/**",
      "deploy/aliyun-fc/verify/**",
      "deploy/aliyun-fc/verify-fc/**",
      "deploy/aliyun-fc/fc-upload-v04/**",
      "deploy/aliyun-fc/zip-check-v04/**",
      "dist/**",
      "out/**",
      "coverage/**"
    ]
  }
];

export default eslintConfig;
