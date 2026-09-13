# Issues and solutions

| Issue | Stage | Status |
|---|---|---|
| [ISSUE-001](#issue-001-sandbox-blocked-git-and-local-network) | 1 | Resolved through approved escalation |

## ISSUE-001: Sandbox blocked Git and local network

Stage 1 setup expected a branch and a read-only Ollama capability check. Git could not create `.git/HEAD.lock`; curl reported `Operation not permitted` when opening a socket. The downstream JSON decoder also failed because curl produced no response. No application code was involved.

Investigation compared the errors with the environment's read-only `.git` and restricted network rules. Retrying the same operations through the permission mechanism succeeded. This confirms a sandbox restriction, not a broken Git repository or unavailable model.

The solution was approved escalation for Git mutations and network-dependent commands. Verification: `git switch -c implement-v1` succeeded; Ollama `/api/show` returned completion and thinking capabilities and the original seven tuning values. No tuning was changed.

Lesson: inspect the first error in a pipeline. An empty HTTP response can cause a misleading JSON error. Status: resolved for these operations; future restricted commands may need the same mechanism.
