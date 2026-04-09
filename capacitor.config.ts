import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAP_SERVER_URL?.trim();
const isLocalDevServer = !!devServerUrl && /^http:\/\/(localhost|127\.0\.0\.1)/i.test(devServerUrl);

const config: CapacitorConfig = {
  appId: "com.seekeatz.app",
  appName: "SeekEatz",
  webDir: "out",
  bundledWebRuntime: false,
  server: devServerUrl
    ? {
        url: devServerUrl,
        cleartext: isLocalDevServer,
        allowNavigation: ["*"],
      }
    : {
        url: "https://seekeatz.com",
      },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    Keyboard: {
      resize: "body",
    },
  },
};

export default config;
