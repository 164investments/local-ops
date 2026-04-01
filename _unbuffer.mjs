// Forces stdout/stderr to flush immediately (unbuffered) when Node is piped.
// Used as --import preload for child scripts.
import { createWriteStream } from "node:fs";

for (const fd of [1, 2]) {
  const stream = fd === 1 ? process.stdout : process.stderr;
  if (stream._handle && stream._handle.setBlocking) {
    stream._handle.setBlocking(true);
  }
}
