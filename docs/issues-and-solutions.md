# Issues and solutions

| Issue | Stage | Status |
|---|---|---|
| [ISSUE-010](#issue-010-a-queued-auto-scroll-overrode-the-readers-position) | 8 | Resolved |
| [ISSUE-009](#issue-009-disabled-option-assertion-did-not-reflect-native-selection) | 8 | Resolved |
| [ISSUE-008](#issue-008-browser-locator-confused-label-text-with-accessible-name) | 8 | Resolved |
| [ISSUE-005](#issue-005-browser-terminal-events-needed-correlation-before-parser-state) | 8 | Resolved |
| [ISSUE-006](#issue-006-playwrights-installed-browser-revision-did-not-match) | 8 | Installation resolved |
| [ISSUE-007](#issue-007-automatic-approval-review-temporarily-blocked-a-live-check) | 8 | Resolved |
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

## ISSUE-005: Browser terminal events needed correlation before parser state

Stage 8 independent review reproduced two parser failures. A terminal event carrying an old request ID set the parser's terminal flag before the reducer could reject it, discarding the current response. Separately, a valid terminal event left the parser waiting for EOF, keeping the request reference active even while the UI showed completion.

Expected behavior was to ignore unrelated events and become ready for another request after a matching terminal event. The new tests first failed with only the stale finish delivered, and with a stream-consumption promise still pending after 100 milliseconds.

The root causes were correlation occurring too late and transport EOF being treated as necessary after an application terminal result. `consumeStream` now requires the expected request ID, rejects mismatched events before changing terminal state, and exits its read loop after a matching finish or error. Its finally block cancels the reader. App and smoke callers pass their request IDs explicitly.

Verification: both regression tests and all existing parser tests pass in `tests/stream.test.ts`. No alternative workaround was used. Lesson: protocol completion and socket closure are separate; every layer that keeps request state must apply correlation. Status: resolved.

## ISSUE-006: Playwright's installed browser revision did not match

Stage 8's first browser run failed all 16 cases before page creation. Playwright requested `chromium_headless_shell-1243`, while the preexisting cache contained an older Chromium revision. No browser behavior had been tested by that run.

The package version and requested executable path identified the mismatch. `npx playwright install chromium` downloaded the matching Chromium and headless shell. The setup instructions and CI now include this install step. The solution uses Playwright's matching build rather than depending on a machine-specific system Chrome path.

Verification: browser checks are rerun after installation; the final Stage 8 record contains their result. Lesson: installing the JavaScript package does not guarantee that its browser binary is present. Status: browser installation resolved; application results are recorded separately.

## ISSUE-007: Automatic approval review temporarily blocked a live check

After Stage 7, automatic approval review rejected `npm run smoke:local` with an account usage-limit message. The command did not start. This was an environment approval failure, not an Ollama or application failure.

The user later supplied an environment with unrestricted permissions and explicitly said to continue. The command was then run normally. It verified direct streaming, a follow-up returning 7, separately identified reasoning, and cancellation during output. The server logged `stopped` for the cancellation request. No Gemini generation ran.

Lesson: record an unexecuted verification as pending rather than failed application behavior or a successful check. Status: resolved after the user's environment update and continuation instruction.

## ISSUE-008: Browser locator confused label text with accessible name

After installing Chromium, every browser test timed out in the shared setup while looking for an exact `Provider` label. The failure snapshot showed a visible, enabled combobox whose accessible name was `Provider`, so this was a test-locator failure rather than a missing selector or failed config request.

The HTML label wraps the select and its options. Playwright's exact label-text matching did not equal the control's computed accessible name. The setup and selection assertions now use `getByRole('combobox', { name: 'Provider', exact: true })`, which matches what assistive technology exposes. No application change was necessary.

Verification: all eight initial desktop workflows passed after changing the locator. The final suite also covers mobile and missing-key UI behavior. Lesson: inspect the accessibility snapshot before weakening assertions or changing working UI. Status: resolved.

## ISSUE-009: Disabled option assertion did not reflect native selection

The added missing-Gemini-key browser test failed because Playwright's `toBeDisabled()` reported enabled for an option whose failure snapshot showed `<option disabled>`. The app had correctly rendered the native disabled property, and the selector itself remained enabled so Local could be used.

Investigation separated the option's native property from the matcher's element-disabled interpretation. The test now checks `disabled === true` through `toHaveJSProperty`, focuses the select, presses ArrowDown, and verifies that Local remains selected. This proves keyboard selection skips unavailable Gemini without disabling the entire selector.

Verification: the targeted test passed on desktop and mobile. No production change was made. Lesson: test the user's interaction and native control state when a generic matcher reports a contradictory result. Status: resolved.

## ISSUE-010: A queued auto-scroll overrode the reader's position

A repeated Stage 8 desktop browser check exposed an intermittent real UI failure. The test scrolled a long streaming response to the top, saw Jump to latest, then found `scrollTop` at 1,679 rather than zero when generation completed. Earlier runs had passed.

Investigation traced the auto-scroll effect's captured `awayFromBottom` state. A render queued before the manual scroll could still run its effect with the old false value and scroll to the bottom. That native scroll event then restored following, overriding the user's choice.

The solution adds a `followLatest` ref updated synchronously by the scroll handler before setting display state. The effect reads the current ref rather than a value captured by an earlier render. New chat and Jump to latest explicitly restore following. The independent reviewer found no remaining defect in the scoped fix.

Verification: the existing regression failed with the original implementation, then passed ten repeated browser runs, five desktop and five mobile. The final full check is recorded in the handoff. No timer delays or weakened position assertions were added. Lesson: state used to guard queued imperative effects may need a synchronous ref alongside the state used to render controls. Status: resolved.
