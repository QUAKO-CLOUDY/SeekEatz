const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

function injectUseModularHeaders(podfileContents) {
  if (podfileContents.includes("use_modular_headers!")) {
    return podfileContents;
  }

  const platformLineRegex = /platform :ios[^\n]*\n/;
  if (platformLineRegex.test(podfileContents)) {
    return podfileContents.replace(
      platformLineRegex,
      (line) => `${line}use_modular_headers!\n`
    );
  }

  const firstTargetRegex = /target ['"][^'"]+['"] do/;
  if (firstTargetRegex.test(podfileContents)) {
    return podfileContents.replace(
      firstTargetRegex,
      (line) => `use_modular_headers!\n\n${line}`
    );
  }

  return podfileContents;
}

module.exports = function withCapacitorModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) {
        return modConfig;
      }

      const original = fs.readFileSync(podfilePath, "utf8");
      const updated = injectUseModularHeaders(original);
      if (updated !== original) {
        fs.writeFileSync(podfilePath, updated);
      }

      return modConfig;
    },
  ]);
};
