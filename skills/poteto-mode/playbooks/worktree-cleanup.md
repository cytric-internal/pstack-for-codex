Delegation, lifecycle, isolation, history, and capability fallbacks follow `../references/codex-agent-runtime.md`.

### Worktree and simulator cleanup

**You own the disk and the safety gate.** Review candidates with `scripts/worktree-audit.sh`, then verify each candidate is inactive and has no unpreserved work before cleanup.

1. Snapshot and audit. Record `df -h /`, then run `scripts/worktree-audit.sh`. Use exact paths from `git worktree list`; do not guess paths. Treat its classifications as advice. Check pinned and active chats through supported task listing and history. If usage is unclear, leave the worktree in place and report it for review.
2. For managed Codex worktrees, identify the artifact with `list_artifacts` and verify it is not primary, pinned, shared, or in use. Identify and preserve any needed ignored files before archival because the snapshot does not include them. If they cannot be preserved, leave the worktree in place. Archive eligible worktrees with `archive_worktree`; it preserves a recoverable Git snapshot, including tracked changes, unpushed commits, and non-ignored untracked files. If the archival tool is unavailable, leave the managed worktree in place and report it. Keep its chat open and do not modify or close associated pull requests. Do not delete files to make a worktree eligible.
3. For unmanaged worktrees, preserve unknown or uncommitted work. Show tracked changes and untracked files and leave the worktree in place when their value is unclear. Confirm its commits remain reachable from a retained branch or remote before removal, especially for a detached HEAD. Remove only a confirmed-safe worktree with `git worktree remove <exact-path>` without `--force`, then run `git worktree prune`. If Git refuses removal, keep the remaining directory and report it; never use `rm -rf` as a fallback.
4. Simulators and other reclaimers. Use `xcrun simctl --set testing delete all` for XCTestDevices clones and `xcrun simctl delete unavailable` for unavailable simulators. Review runtimes before deleting old ones. Clear Xcode caches or package caches only when they are explicitly in scope. Never infer or delete application-support data.

Reply with `df -h /` before and after, what was archived or removed, and why each held item remains.
