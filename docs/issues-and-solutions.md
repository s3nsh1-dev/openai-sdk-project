# Issues and solutions

| Issue | Stage | Status |
|---|---|---|
| [ISSUE-004](#issue-004-an-abort-can-look-like-an-ordinary-end-of-iteration) | 6 | Resolved |
| [ISSUE-003](#issue-003-a-failing-validation-test-reached-the-local-model) | 5 | Resolved |
| [ISSUE-002](#issue-002-express-error-handler-arity-and-linting) | 2 | Resolved |
| [ISSUE-001](#issue-001-sandbox-blocked-git-and-local-network) | 1 | Resolved through approved escalation |

## ISSUE-001: Sandbox blocked Git and local network

Stage 1 setup expected a branch and a read-only Ollama capability check. Git could not create `.git/HEAD.lock`; curl reported `Operation not permitted` when opening a socket. The downstream JSON decoder also failed because curl produced no response. No application code was involved.

Investigation compared the errors with the environment's read-only `.git` and restricted network rules. Retrying the same operations through the permission mechanism succeeded. This confirms a sandbox restriction, not a broken Git repository or unavailable model.

The solution was approved escalation for Git mutations and network-dependent commands. Verification: `git switch -c implement-v1` succeeded; Ollama `/api/show` returned completion and thinking capabilities and the original seven tuning values. No tuning was changed.

Lesson: inspect the first error in a pipeline. An empty HTTP response can cause a misleading JSON error. Status: resolved for these operations; future restricted commands may need the same mechanism.

## ISSUE-002: Express error-handler arity and linting

Stage 2 linting rejected the unused `_next` parameter in the four-argument error middleware. Express identifies error handlers by their arity, so removing the parameter would change routing behavior. The lint rule did not yet recognize the intentional underscore convention.

The fix configures `argsIgnorePattern: '^_'` for unused function parameters. This preserves Express's required signature while keeping unused local variables checked. No alternative implementation was attempted. Verification: rerunning ESLint passed, and the integration tests still pass. Lesson: framework-required parameters need an explicit lint convention. Status: resolved.

## ISSUE-003: A failing validation test reached the local model

Stage 5 introduced a test expecting oversized input to be rejected. Before the budget guard existed, the test used default configuration and attempted an actual Ollama request, timing out after ten seconds. It was meant to be deterministic. No Gemini endpoint or key was used.

Investigation traced the default Ollama URL through `createApp(loadConfig({}))`. A negative validation test can reach a provider precisely when the validation being tested is broken. Adding the budget fixed that behavior, but did not protect future regression runs from accidental live calls.

The solution adds `tests/network-guard.ts` to Vitest setup. Test fetches may reach temporary loopback fixture ports only; the Ollama port and all external hosts are denied. Integration tests still run the real SDK against fake HTTP servers. Verification: the deterministic suite passes with this guard installed. Lesson: make live-provider isolation independent of the behavior under test. Status: resolved for Vitest; Stage 8 browser setup must apply its own fixture-only provider configuration.

## ISSUE-004: An abort can look like an ordinary end of iteration

Stage 6 needed cancellation to stop upstream work and release the provider slot. The SDK async iterator's abort behavior cannot be assumed to always throw: an iterator may exit as the signal becomes aborted. Treating loop exit alone as success risks emitting a completion for stopped work.

Investigation read the installed SDK streaming implementation and exercised timed-out and disconnected fixture streams. The solution checks `controller.signal.throwIfAborted()` after iteration, preserves the timeout reason separately from a browser disconnect, and releases timers and provider slots in `finally`. The browser also marks Stop immediately and ignores events after terminal state. No failed workaround was used.

Verification: deadline tests pass before activity and after partial output; a disconnect closes the fake upstream connection and a subsequent request succeeds. This is a defensive lifecycle finding, not a claim that every SDK abort ends silently. Lesson: loop completion and successful model completion are different facts. Status: resolved by explicit signal and finish-reason checks.
