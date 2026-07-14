import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const plistPath = fileURLToPath(
  new URL("../assets/LocalOps-Info.plist", import.meta.url)
);
const setupPath = fileURLToPath(new URL("../setup.sh", import.meta.url));

const valueAfterKey = (plist, key) => {
  const match = plist.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`)
  );
  return match?.[1];
};

test("macOS launcher declares Apple Silicon before Intel", async () => {
  const plist = await readFile(plistPath, "utf8");
  const architectureBlock = plist.match(
    /<key>LSArchitecturePriority<\/key>\s*<array>([\s\S]*?)<\/array>/
  )?.[1];

  assert.ok(architectureBlock, "LSArchitecturePriority is required");
  assert.match(architectureBlock, /<string>arm64<\/string>/);
  assert.match(architectureBlock, /<string>x86_64<\/string>/);
  assert.ok(
    architectureBlock.indexOf("<string>arm64</string>") <
      architectureBlock.indexOf("<string>x86_64</string>"),
    "arm64 must be listed before x86_64"
  );
  assert.equal(
    valueAfterKey(plist, "CFBundleIdentifier"),
    "com.164investments.local-ops.launcher"
  );
});

test("installer copies the versioned launcher plist", async () => {
  const setup = await readFile(setupPath, "utf8");

  assert.match(
    setup,
    /INFO_PLIST_SOURCE="\$INSTALL_DIR\/assets\/LocalOps-Info\.plist"/
  );
  assert.match(
    setup,
    /cp "\$INFO_PLIST_SOURCE" "\$HOME\/Applications\/Local Ops\.app\/Contents\/Info\.plist"/
  );
});
