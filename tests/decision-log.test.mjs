import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(pluginRoot, "skills/show-me-your-work/scripts/log.sh");
const header = "ts\tphase\tdecision\twhy\tevidence\tresult\n";

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pstack-decision-log-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, "decisions.tsv");
}

function appendRow(file, phase) {
  const result = spawnSync("bash", [helper, file, phase, "choose", "reason", "evidence", "result"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function headerCount(contents) {
  return contents.split("\n").filter((line) => line === header.trimEnd()).length;
}

test("decision log initializes an absent TSV once and appends rows", async (t) => {
  const file = await fixture(t);
  appendRow(file, "first");
  appendRow(file, "second");
  const contents = await fs.readFile(file, "utf8");
  assert.equal(headerCount(contents), 1);
  const lines = contents.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /\tfirst\tchoose\treason\tevidence\tresult$/);
  assert.match(lines[2], /\tsecond\tchoose\treason\tevidence\tresult$/);
});

test("decision log initializes an empty TSV once", async (t) => {
  const file = await fixture(t);
  await fs.writeFile(file, "");
  appendRow(file, "first");
  appendRow(file, "second");
  const contents = await fs.readFile(file, "utf8");
  assert.equal(headerCount(contents), 1);
  assert.equal(contents.trimEnd().split("\n").length, 3);
});

test("decision log preserves existing rows and appends without truncation", async (t) => {
  const file = await fixture(t);
  const existingRow = "2026-09-01T00:00:00Z\tprior\tkeep\told reason\told evidence\told result\n";
  await fs.writeFile(file, `${header}${existingRow}`);
  appendRow(file, "new");
  const contents = await fs.readFile(file, "utf8");
  assert.equal(headerCount(contents), 1);
  assert.ok(contents.startsWith(`${header}${existingRow}`));
  assert.equal(contents.trimEnd().split("\n").length, 3);
  assert.match(contents.trimEnd().split("\n")[2], /\tnew\tchoose\treason\tevidence\tresult$/);
});
