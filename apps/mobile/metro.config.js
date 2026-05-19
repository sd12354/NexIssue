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

config.resolver.extraNodeModules = {
  "@babel/runtime": resolveFromApp("@babel/runtime"),
  "hoist-non-react-statics": resolveFromApp("hoist-non-react-statics"),
};

module.exports = config;
