# Upstream maintenance

This repository derives from `pstack` in `https://github.com/cursor/plugins`. The locked source is version `0.15.5` at commit `adf3218ca2f5b9971eedc07a76bef22df7701539`. Every delivered refresh names an exact commit; never use mutable `main` as provenance.

The delivered repository contains only the modified Codex version. The fork is published at `https://github.com/cytric-internal/pstack-for-codex`; Aqua-123 and Cursor remain credited in `NOTICE`. Do not push a raw upstream branch or snapshot commit. Do not keep an upstream remote in the delivered checkout.

## Provenance files

- [`NOTICE`](./NOTICE) records attribution and the source commit.
- [`upstream.lock.json`](./upstream.lock.json) records the 158 source paths, sizes, and SHA-256 hashes.
- [`compatibility/pstack-map.json`](./compatibility/pstack-map.json) assigns each source path a Codex path, classification, invariant, and validation. Its `refresh.fromFiles` inventory and `refreshDecisions` ledger prove the completed refresh delta.
- [`compatibility/report.md`](./compatibility/report.md) is the generated human-readable report.

## Check the locked source

Use a temporary local source checkout. The import helper removes its own temporary clone when you pass a repository URL, and it never writes into the derived tree.

```bash
node scripts/import-upstream.mjs \
  --source https://github.com/cursor/plugins \
  --subdirectory pstack \
  --commit adf3218ca2f5b9971eedc07a76bef22df7701539 \
  --verify-lock \
  --dry-run
```

The command must report `Verified 158 files`.

## Review a newer source commit

1. Clone the source repository into a temporary directory and check out the exact candidate commit.
2. Point `scripts/generate-compatibility-report.mjs --upstream-dir` at the candidate `pstack` directory.
3. Compare the exact old and candidate snapshots. Review every added, changed, deleted, or renamed path. Record a per-path `refreshDisposition` and a matching `refreshDecisions` row in `compatibility/pstack-map.json` before adapting code. Store the complete prior inventory in `refresh.fromFiles`.
4. Port behavior into the Codex tree. Preserve Codex-native delegation, explicit-only skill invocation, authorization boundaries, and tested safety overlays. Translate model effort guidance to supported Codex `reasoning_effort` values; never copy Cursor installation or runtime claims.
5. Update source metadata and hashes in `upstream.lock.json` only after the delta review and port are complete.
6. Regenerate `compatibility/report.md`, run provenance and compatibility checks, then the appropriate release checks.
7. Remove the temporary source checkout. Confirm that the delivered repository has no upstream remote or raw source branch.

Refreshes are deliberately reviewed and pinned manually. The import and report scripts provide inventory, hash verification, and delta accounting; there is no automatic updater. Keep the prior snapshot available until every disposition is resolved and the new report passes.

To inspect a candidate without changing the committed report, run:

```bash
node scripts/generate-compatibility-report.mjs \
  --check \
  --upstream-dir /absolute/path/to/temporary/plugins/pstack
```

The command exits with blocking findings until every source delta has an explicit disposition. The import helper refuses to overwrite an existing output directory, and the inventory rejects symlinks.

## Regenerate the report

After the lock and compatibility map agree, run:

```bash
node scripts/generate-compatibility-report.mjs
node scripts/generate-compatibility-report.mjs --check
node --test tests/upstream-provenance.test.mjs tests/compatibility-map.test.mjs
```

Review the generated diff. A complete report accounts for every locked path and has no unresolved source delta.
