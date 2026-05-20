/**
 * Toggle native modules for iOS CocoaPods autolinking.
 * - sim:    simulator-friendly (no Google ML Kit — no arm64 simulator slice)
 * - device: includes ML Kit for on-device label OCR
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const profile = process.argv[2];
if (profile !== "sim" && profile !== "device") {
  console.error("Usage: node scripts/ios-pod-profile.mjs <sim|device>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const baseExclude = ["expo-image"];
const mlkitExclude = [
  "@infinitered/react-native-mlkit-core",
  "@infinitered/react-native-mlkit-text-recognition",
];

pkg.expo ??= {};
pkg.expo.autolinking ??= {};
pkg.expo.autolinking.exclude =
  profile === "device" ? baseExclude : [...baseExclude, ...mlkitExclude];

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`iOS pod profile: ${profile}`);
