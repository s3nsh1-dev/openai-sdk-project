# Provider thinking controls and local output allocation

This post-v1 fix follows the user's screenshots from September 14, 2026. It is developed on `fix/provider-thinking`, based on the completed v1 branch at `40191e2`. The verified implementation, tests, and documentation are committed in `c98beeb`. The original eight milestone commits remain unchanged.

## What went wrong

The original plan made thinking a Local-only checkbox and deliberately did not request Gemini thought summaries. The UI therefore disabled the control when Gemini was selected. This was implemented as planned but did not match the user's expectation when trying the app.

Local had a fixed 1,024-token output cap for both reasoning and the final answer. The live prompt `teach me about promises` used all 1,024 completion tokens, emitting 3,774 reasoning characters but only 135 answer characters before `finish_reason: length`. The incomplete label was correct; the allocation wasted otherwise available context.

## Build order and code walkthrough

1. Add failing tests in `tests/output-budget.test.ts` and update the Gemini adapter test. They demonstrate the too-small fixed cap and missing summary request.
2. Add `outputBudget` in `src/server/budget.ts`. For Local it returns `4096 - 256 - estimateInput(messages)`. The existing input guard remains 2,816, so at least 1,024 output tokens remain. The estimate still includes system instructions and message overhead. This is conservative accounting, not an exact tokenizer.
3. Use that request-specific limit in `src/server/provider.ts`. No GPU, thread, context, or sampling tuning is changed. Direct local answers also benefit from unused context, which helps longer replies with thinking off.
4. Send `extra_body.google.thinking_config.include_thoughts: true` only when Gemini summaries are explicitly checked. Do not send `reasoning_effort: none` to Gemini 3 or claim that its internal thinking is disabled. The existing normalizer accepts separately identified reasoning fields and never guesses from answer text.
5. Keep separate Local thinking and Gemini summary preferences in `App.tsx`. They reset on New chat. The Gemini label describes summaries rather than an on/off switch for internal thought.
6. Exercise the checkbox, posted preference, and rendered summary through the real browser/Express/SDK fixture path.

The public Local output limit is now a ceiling of 3,840 before estimated input is subtracted. The application cannot promise unlimited output: a long conversation or lengthy reasoning can still exhaust its remaining context. Such attempts remain incomplete and stay out of future context. Retry remains explicit.

## Verification and limits

The regression tests failed before implementation and pass with the new request options and output allocation. The full check passed 45 deterministic tests, 20 browser cases, lint, type checking, and build. The repeated Local prompt finished normally using 2,425 completion tokens, with 4,583 answer characters. Original tuning was rechecked unchanged. See [handoff](../handoff.md) for the recorded checkpoint. `npx tsx --env-file-if-exists=.env scripts/diagnose-local-thinking.ts` is a Local-only diagnostic that reports counts and finish status without printing generated text. It is excluded from routine tests and CI.

Gemini summary behavior is fixture-tested. No new live Gemini generation is part of this fix's routine verification. The user's screenshot demonstrates successful live responses as well as one response missing its terminal result. The screenshot alone cannot establish the cause of that interruption. The missing-finish guard remains intact, preserving partial text without inventing completion or automatically retrying a cloud call.

See [ISSUE-011](../issues-and-solutions.md#issue-011-thinking-controls-and-a-fixed-local-output-cap) for observations, investigation, and verification. Google's [OpenAI compatibility guide](https://ai.google.dev/gemini-api/docs/openai) documents the thought-summary request and distinguishes it from the model's internal thinking.

Exercise: compare short and long message arrays in the output-budget test. Explain why increasing output to a fixed 4,096 tokens would violate the local context allowance, and why treating `[DONE]` alone as a successful answer would conceal an incomplete provider stream.
