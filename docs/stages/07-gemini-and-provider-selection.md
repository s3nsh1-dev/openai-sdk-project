# Stage 7: Gemini and provider selection

Goal: run the same chat workflow against an explicitly chosen cloud provider. Prerequisite: Stage 6, commit `286ed9a`.

Build the provider factory in `src/server/provider.ts` first. Each adapter selects its server-owned endpoint, key, model, and output budget. The shared handler then uses the selected adapter without fallback. Add the public config schema and browser selector last. Configuration uses the user's `gemini-3.8-flash` choice, confirmed in [Google's model catalog](https://ai.google.dev/gemini-api/docs/models) on September 14, 2026.

Gemini receives a 4,096 output-token limit and no request for thought summaries. Local retains its 1,024 output limit and optional thinking control. Provider chunks still pass through the same runtime normalizer. SDK automatic retries remain disabled for both.

The selector starts on Local and locks after the first attempted turn, including a failed attempt. New chat stops any active request, clears history, and returns to Local. Gemini is disabled when the server has no key. With Gemini selected, the interface explains that messages go to Google. `/api/config` does not probe connectivity or generate text.

Tests inject a transport into the SDK factory to direct requests to local fake HTTP servers. Production always uses the fixed Google endpoint; browser requests cannot change it. This tests the real SDK request construction without consuming quota.

Verification: 32 deterministic tests passed; lint and type checking passed. Fixtures verify the model, output budget, absent thought-summary options, missing-key rejection, and quota failure without retry or fallback. A real key is configured locally, but no live Gemini generation was authorized or performed. Gemini is implemented and fixture-tested; live verification is pending.

Run `npm run dev` for the checkpoint. `npm run smoke:gemini` is the explicit one-request cloud smoke command and may consume account quota. It is excluded from `npm test`, `npm run check`, and CI. `npm run smoke:local` checks direct streaming, follow-up context, reasoning, and cancellation through the application.

Exercise: explain why enabling a selector is different from proving that a model is reachable with the account's current quota.

Milestone: `feat(stage-7): add explicit Gemini selection and provider isolation`. No new implementation difficulty occurred; see the existing [journal](../issues-and-solutions.md).

Actual milestone commit: `8145cb0`.

Post-v1 update: [provider thinking controls and output allocation](../fixes/provider-thinking.md) changes the fixed local cap and adds selectable Gemini summaries. This stage document describes its original historical milestone.
