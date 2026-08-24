import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xrwei.aitranslator",
  appName: "AI 随身同传",
  webDir: "out",
  server: {
    androidScheme: "https"
  }
};

export default config;
