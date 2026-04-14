#!/usr/bin/env node
// Copy public/ (and optionally dev-public/) to dist/, clearing dist first.
const { cpSync, rmSync, mkdirSync, existsSync } = require("fs");
const { resolve } = require("path");

const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const pub = resolve(root, "public");
const devPub = resolve(root, "dev-public");

// Clean dist
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Copy public/ → dist/
if (existsSync(pub)) {
  cpSync(pub, dist, { recursive: true });
}

// In dev mode (arg "dev"), also copy dev-public/
if (process.argv[2] === "dev" && existsSync(devPub)) {
  cpSync(devPub, dist, { recursive: true });
}

console.log("✓ dist/ prepared from public/" + (process.argv[2] === "dev" ? " + dev-public/" : ""));
