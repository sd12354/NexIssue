const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

function resolveFromApp(moduleName) {
  return path.dirname(
    require.resolve(`${moduleName}/package.json`, {
      paths: [projectRoot, monorepoRoot],
    }),
  );
}

// Pin shared/peer dependencies to the mobile app's hoisted copies so Metro
// doesn't end up loading two copies of React, etc. from pnpm's nested store.
config.resolver.extraNodeModules = {
  "@babel/runtime": resolveFromApp("@babel/runtime"),
  "hoist-non-react-statics": resolveFromApp("hoist-non-react-statics"),
  react: resolveFromApp("react"),
  "react-native": resolveFromApp("react-native"),
  "react-native-web": resolveFromApp("react-native-web"),
  "react-dom": resolveFromApp("react-dom"),
  "expo-file-system": resolveFromApp("expo-file-system"),
  "expo-image-manipulator": resolveFromApp("expo-image-manipulator"),
  "expo-vision-mask": path.resolve(projectRoot, "modules/expo-vision-mask"),
};

module.exports = config;
