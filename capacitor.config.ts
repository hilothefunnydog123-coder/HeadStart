import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.departure.alarm",
  appName: "Departure",
  webDir: "dist",
  backgroundColor: "#eef5f3",
  loggingBehavior: "none",
  ios: {
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#eef5f3",
  },
};

export default config;
