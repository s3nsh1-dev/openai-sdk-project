# Decisions

| Decision | Alternatives considered | Reason and cost |
|---|---|---|
| One npm project, React/Vite and Express | A full-stack framework or separate repos | Makes browser/server boundaries easy to trace. We configure a development proxy and production static serving ourselves. |
| OpenAI SDK Chat Completions | Native Ollama and Google clients | Both selected providers expose compatible streaming APIs. A runtime normalizer contains compatibility differences; it does not assume every SDK field is supported. |
| POST response with SSE | Browser EventSource, WebSocket, NDJSON | JSON POST naturally carries explicit history. SSE has a parser library and readable frames. EventSource cannot send this body; WebSocket adds connection state we do not need. |
| React state and a pure attempt reducer | External state library | Enough for one conversation. Request IDs and terminal states are explicit, with no hidden cache. |
| In-memory browser history | Database, localStorage | Keeps conversations in the current browser session and clears them on refresh. Only complete exchanges enter context, so incomplete answers cannot silently become model memory. |
| Conservative byte estimate | Exact Qwen tokenizer or unrelated tokenizer | A byte-based estimate is readable and deliberately conservative. It may reject text that would actually fit. It is never described as exact accounting. |
| Local by default, locked provider per conversation | Automatic fallback or mid-chat switching | Keeps local history from unexpectedly going to Google. New chat resets Local. Availability means configuration, not verified quota or connectivity. |
| Thinking off locally by default | Always-on reasoning | Qwen can spend the whole output budget reasoning. Off uses `reasoning_effort: none` while preserving existing tuning. |
| Configurable Gemini model | A hardcoded model | `GEMINI_MODEL` defaults to `gemini-3.8-flash` and can select another supported model through `.env`. No automatic substitution occurs. |
| Plain CSS and safe Markdown | UI framework or raw HTML rendering | Keeps styling dependencies small. Generated HTML and remote images are disabled; generated code is never executed. |
| Deterministic HTTP fixtures plus separate live smoke commands | Live-provider tests in CI | Fixtures reproduce limits, errors, malformed chunks, and cancellation without quota use. Live smoke checks prove a narrower fact about the actual provider at one point in time. |

Provider references checked during implementation: [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [Google compatibility](https://ai.google.dev/gemini-api/docs/openai), [Google models](https://ai.google.dev/gemini-api/docs/models), and [OpenAI SDK documentation](https://developers.openai.com/api/docs/libraries). Installed SDK source was also inspected for abort behavior. Account quotas and live access are not inferred from these pages.

Local thinking and Gemini thought summaries have separate controls. Local output uses the context remaining after estimated input and a safety margin. See the [streaming protocol](protocol.md) for request fields and budget calculations.
