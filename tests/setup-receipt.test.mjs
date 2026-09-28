import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installAgents, uninstallAgents } from "../skills/setup-pstack/scripts/manage-agents.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "pstack-receipt-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  const userHome = path.join(temporary, "home");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(userHome, { recursive: true });
  return { projectRoot, userHome };
}

test("an unchanged project-scoped install is reversible from its hash receipt", async (t) => {
  const { projectRoot, userHome } = await fixture(t);
  const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" });
  const receipt = JSON.parse(await fs.readFile(path.join(projectRoot, installed.receiptPath), "utf8"));
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.scope, "project");
  assert.equal(receipt.files.length, 2);
  assert.ok(receipt.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));

  const removed = await uninstallAgents({ projectRoot, userHome, scope: "project" });
  assert.equal(removed.status, "uninstalled");
  for (const file of receipt.files) {
    await assert.rejects(fs.stat(path.join(projectRoot, file.path)), { code: "ENOENT" });
  }
});

test("a locally modified installed profile requires review and remains untouched", async (t) => {
  const { projectRoot, userHome } = await fixture(t);
  const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" });
  const target = path.join(projectRoot, installed.files[0].path);
  const unchanged = path.join(projectRoot, installed.files[1].path);
  await fs.appendFile(target, "\n# local change\n");

  await assert.rejects(
    installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" }),
    /review required for divergent pstack-owned files.*modified.*run uninstall to preserve changed files/,
  );

  const removed = await uninstallAgents({ projectRoot, userHome, scope: "project" });
  assert.equal(removed.status, "uninstalled-with-preserved-files");
  assert.deepEqual(removed.modified, [installed.files[0].path]);
  assert.deepEqual(removed.diagnostics.map(({ path: file, status }) => ({ path: file, status })), [
    { path: installed.files[0].path, status: "modified" },
  ]);
  assert.match(removed.recovery, /Move or remove them before reinstalling/);
  assert.match(await fs.readFile(target, "utf8"), /local change/);
  await assert.rejects(fs.stat(unchanged), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(projectRoot, installed.receiptPath)), { code: "ENOENT" });
  await fs.stat(path.join(projectRoot, removed.archivedReceipt));
});

test("a missing managed profile is diagnosed and uninstall remains recoverable", async (t) => {
  const { projectRoot, userHome } = await fixture(t);
  const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" });
  await fs.rm(path.join(projectRoot, installed.files[0].path));

  await assert.rejects(
    installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" }),
    /\(missing\).*run uninstall to preserve changed files/,
  );
  const removed = await uninstallAgents({ projectRoot, userHome, scope: "project" });
  assert.equal(removed.status, "uninstalled-with-preserved-files");
  assert.equal(removed.diagnostics[0].status, "missing");
  await fs.stat(path.join(projectRoot, removed.archivedReceipt));
});

test("forged receipt paths cannot select uninstall targets", async (t) => {
  const { projectRoot, userHome } = await fixture(t);
  const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" });
  const receiptPath = path.join(projectRoot, installed.receiptPath);
  const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  const victim = path.join(projectRoot, ".codex/keep-me.txt");
  await fs.writeFile(victim, "user data\n");
  receipt.files[0].path = ".codex/keep-me.txt";
  receipt.files[0].sha256 = "0".repeat(64);
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  await assert.rejects(uninstallAgents({ projectRoot, userHome, scope: "project" }), /unexpected path/);
  assert.equal(await fs.readFile(victim, "utf8"), "user data\n");
  for (const file of installed.files) await fs.stat(path.join(projectRoot, file.path));
  await fs.stat(receiptPath);
});

test("duplicate and missing role paths invalidate a setup receipt", async (t) => {
  await t.test("duplicate", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" });
    const receiptPath = path.join(projectRoot, installed.receiptPath);
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    receipt.files[1].path = receipt.files[0].path;
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(uninstallAgents({ projectRoot, userHome, scope: "project" }), /duplicate path/);
  });

  await t.test("missing", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "project" });
    const receiptPath = path.join(projectRoot, installed.receiptPath);
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    receipt.files.pop();
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(uninstallAgents({ projectRoot, userHome, scope: "project" }), /missing expected path/);
  });
});

test("user-scoped installs write only beneath the supplied Codex home", async (t) => {
  const { projectRoot, userHome } = await fixture(t);
  const installed = await installAgents({ pluginRoot: root, projectRoot, userHome, scope: "user" });
  assert.ok(installed.files.every((file) => file.path.startsWith("agents/")));
  for (const file of installed.files) await fs.stat(path.join(userHome, ".codex", file.path));
  await assert.rejects(fs.stat(path.join(projectRoot, ".codex/agents")), { code: "ENOENT" });
});

test("reserved role destinations are never overwritten without a valid ownership receipt", async (t) => {
  for (const contents of ['name = "someone-else"\n', 'sandbox = "read-only"\n']) {
    const { projectRoot, userHome } = await fixture(t);
    const reserved = path.join(projectRoot, ".codex/agents/pstack-poteto-agent.toml");
    await fs.mkdir(path.dirname(reserved), { recursive: true });
    await fs.writeFile(reserved, contents);
    await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /reserved custom-agent path already exists/);
    assert.equal(await fs.readFile(reserved, "utf8"), contents);
    await assert.rejects(fs.stat(path.join(projectRoot, ".codex/agents/pstack-comment-sicko.toml")), { code: "ENOENT" });
  }
});

test("managed locations reject leaf and parent symlinks", async (t) => {
  await t.test("leaf", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const dir = path.join(projectRoot, ".codex/agents");
    await fs.mkdir(dir, { recursive: true });
    const outside = path.join(projectRoot, "outside.toml");
    await fs.writeFile(outside, "keep\n");
    await fs.symlink(outside, path.join(dir, "pstack-poteto-agent.toml"));
    await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /symlink at managed path/);
    assert.equal(await fs.readFile(outside, "utf8"), "keep\n");
  });
  await t.test("dangling receipt", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const codex = path.join(projectRoot, ".codex");
    await fs.mkdir(codex, { recursive: true });
    await fs.symlink("missing", path.join(codex, "pstack-for-codex-agent-receipt.json"));
    await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /symlink at managed path/);
  });
  await t.test("parent .codex directory", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const outside = path.join(projectRoot, "outside");
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(projectRoot, ".codex"));
    await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /symlink at managed path/);
    assert.deepEqual(await fs.readdir(outside), []);
  });
});

test("owned profiles can be upgraded and uninstalled", async (t) => {
  const { projectRoot, userHome } = await fixture(t);
  const installed = await installAgents({ pluginRoot: root, projectRoot, userHome });
  await installAgents({ pluginRoot: root, projectRoot, userHome });
  for (const file of installed.files) {
    const content = await fs.readFile(path.join(projectRoot, file.path), "utf8");
    assert.equal(content.includes("\0"), false);
  }
  const removed = await uninstallAgents({ projectRoot, userHome });
  assert.equal(removed.status, "uninstalled");
  for (const file of installed.files) await assert.rejects(fs.stat(path.join(projectRoot, file.path)), { code: "ENOENT" });
});


test("agent directory and user-scoped symlinks are rejected", async (t) => {
  await t.test("agents directory", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const outside = path.join(projectRoot, "outside");
    await fs.mkdir(outside);
    await fs.mkdir(path.join(projectRoot, ".codex"));
    await fs.symlink(outside, path.join(projectRoot, ".codex/agents"));
    await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /symlink at managed path/);
    assert.deepEqual(await fs.readdir(outside), []);
  });
  await t.test("user .codex", async (t) => {
    const { projectRoot, userHome } = await fixture(t);
    const outside = path.join(userHome, "outside");
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(userHome, ".codex"));
    await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome, scope: "user" }), /symlink at managed path/);
    assert.deepEqual(await fs.readdir(outside), []);
  });
});

test("symlink substitution after install is rejected by update and uninstall", async (t) => {
  for (const action of ["update", "uninstall"]) {
    await t.test(action, async (t) => {
      const { projectRoot, userHome } = await fixture(t);
      const installed = await installAgents({ pluginRoot: root, projectRoot, userHome });
      const external = path.join(projectRoot, "external.toml");
      await fs.writeFile(external, "keep\n");
      await fs.rm(path.join(projectRoot, installed.files[0].path));
      await fs.symlink(external, path.join(projectRoot, installed.files[0].path));
      if (action === "update") {
        await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /symlink at managed path/);
      } else {
        await assert.rejects(uninstallAgents({ projectRoot, userHome }), /symlink at managed path/);
      }
      assert.equal(await fs.readFile(external, "utf8"), "keep\n");
    });
  }
});

test("non-object receipts cannot establish ownership or create profiles", async (t) => {
  for (const value of ["null", "false", "0", "\"\"", "[]"]) {
    await t.test(value, async (t) => {
      const { projectRoot, userHome } = await fixture(t);
      const receipt = path.join(projectRoot, ".codex/pstack-for-codex-agent-receipt.json");
      await fs.mkdir(path.dirname(receipt), { recursive: true });
      await fs.writeFile(receipt, `${value}\n`);
      await assert.rejects(installAgents({ pluginRoot: root, projectRoot, userHome }), /cannot establish ownership/);
      assert.equal(await fs.readFile(receipt, "utf8"), `${value}\n`);
      await assert.rejects(fs.stat(path.join(projectRoot, ".codex/agents/pstack-poteto-agent.toml")), { code: "ENOENT" });
      await assert.rejects(fs.stat(path.join(projectRoot, ".codex/agents/pstack-comment-sicko.toml")), { code: "ENOENT" });
    });
  }
});
