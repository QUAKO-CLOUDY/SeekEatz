const { withPodfile } = require("@expo/config-plugins");

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
  return withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = injectUseModularHeaders(modConfig.modResults.contents);
    return modConfig;
  });
};
