import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAP_SERVER_URL?.trim();
const isLocalDevServer = !!devServerUrl && /^http:\/\/(localhost|127\.0\.0\.1)/i.test(devServerUrl);

const config: CapacitorConfig = {
  appId: "com.seekeatz.app",
  appName: "SeekEatz",
  webDir: "out",
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: isLocalDevServer,
          allowNavigation: ["*"],
        },
      }
    : {}),
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
