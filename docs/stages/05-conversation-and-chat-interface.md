# Stage 5: Conversation and chat interface

Goal: maintain a useful conversation without mixing display state into API history. Prerequisite: Stage 4, commit `456d694`.

Build `contextMessages` in `src/client/state.ts` and the server budget guard first. Then add `Markdown.tsx`, `Turn.tsx`, the conversation list and composer in `App.tsx`, and responsive CSS. Tests cover history filtering, oversized input, safe rendering, and Copy.

Each displayed attempt keeps its user text, answer, reasoning, and state. Only completed attempts produce user/assistant pairs for the next API request. The new user message follows those pairs. There is no persistence; refreshing clears the tab. New chat resets the display and local thinking preference.

Qwen's 4,096 context reserves 1,024 output tokens and a 256-token safety margin. `src/server/budget.ts` estimates input as UTF-8 byte length plus 16 per message, including the server prompt. This deliberately overestimates typical text and is not exact Qwen token accounting. Inputs above 2,816 estimated tokens fail with HTTP 413. Nothing is silently trimmed. Gemini has a separate 24,000 estimated-input guard and 4,096 output budget.

React Markdown disables raw HTML, replaces image nodes with an omission label, and restricts unsafe link URLs using its default URL transform. Generated code remains text. Code blocks scroll horizontally and copy their text through the clipboard API. Reasoning uses plain text rendering.

Enter sends; Shift+Enter adds a newline; composing IME input does not submit. Status announcements describe states. Scrolling follows new content only within 100 pixels of the bottom; otherwise Jump to latest appears. The message field regains focus after requests. Stage 8 adds browser tests for these interaction details.

Verification: 22 deterministic tests passed, including React Testing Library checks. Lint and type checking passed. Run `npm run dev` for the multi-turn checkpoint. Exercise: inspect a follow-up request in browser devtools and compare it with the visible attempt data.

Milestone: `feat(stage-5): add bounded conversation and safe chat interface`. See [ISSUE-003](../issues-and-solutions.md#issue-003-a-failing-validation-test-reached-the-local-model) for why tests need a network guard independent of validation.
