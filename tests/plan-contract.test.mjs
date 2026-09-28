import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hasChangeOnlyTick, hasResolvedLiveLane } from "../skills/poteto-mode/scripts/plan-contract.mjs";

test("live-lane contract requires a resolved model or explicit inheritance", () => {
	assert.equal(hasResolvedLiveLane("Ten lanes on `gpt-6-sol` at the PR head."), true);
	assert.equal(hasResolvedLiveLane("Ten lanes on `inherit-parent` at the PR head."), true);
	assert.equal(hasResolvedLiveLane("Ten lanes on `<resolved model slug or inherit-parent>` at the PR head."), false);
	assert.equal(hasResolvedLiveLane("Ten lanes on the configured fast profile at the PR head."), false);
});

test("program tick contract requires change-only messages and a silent unchanged tick", () => {
	assert.equal(hasChangeOnlyTick("Post a short status only when the audit found a tracked change. If the audit found none, end the turn with no reply text."), true);
	assert.equal(hasChangeOnlyTick("Send the operator the queue table every tick."), false);
	assert.equal(hasChangeOnlyTick("Post a status only when the audit found a tracked change."), false);
});

test("the documented plan skeleton and CLI agree on worker and audit requirements", async (t) => {
	const root = fileURLToPath(new URL("../", import.meta.url));
	const guide = await fs.readFile(path.join(root, "skills/poteto-mode/playbooks/multi-phase-plan.md"), "utf8");
	const skeleton = guide.split("````markdown\n")[1].split("````")[0];
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pstack-plan-contract-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const file = path.join(directory, "plan.md");
	async function check(text) {
		await fs.writeFile(file, text);
		return spawnSync(process.execPath, [path.join(root, "skills/poteto-mode/scripts/check-plan.mjs"), file], { encoding: "utf8" });
	}
	for (const worker of ["gpt-6-sol", "pstack-poteto-agent", "inherit-parent"]) {
		const result = await check(skeleton.replaceAll("<resolved model slug or inherit-parent>", worker));
		assert.equal(result.status, 0, result.stderr);
	}
	const unresolved = await check(skeleton);
	assert.equal(unresolved.status, 1);
	assert.match(unresolved.stderr, /must name a resolved model/);
	const noisy = await check(skeleton.replaceAll("<resolved model slug or inherit-parent>", "inherit-parent").replace("If the audit found none, end the turn with no reply text.", "Report the queue every tick."));
	assert.equal(noisy.status, 1);
	assert.match(noisy.stderr, /report only newly tracked changes/);
});
