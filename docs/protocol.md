# Streaming protocol

`POST /api/chat` accepts JSON, with no keys, upstream URLs, or system messages:

```json
{"requestId":"example-1","provider":"local","thinking":false,"messages":[{"role":"user","content":"Explain const."}]}
```

Messages must alternate user and assistant, begin and end with user, and contain nonempty text. Only completed exchanges belong in this array. The server prepends its tutor prompt. Bodies are limited to 128 KiB, 101 messages, and 24,000 characters per message, with a tighter local context budget added in Stage 5.

Successful HTTP responses use `text/event-stream`. Each frame is `data: <JSON>\n\n`; comments such as `: heartbeat\n\n` carry no model progress. All five event types require requestId. Runtime schemas and inferred types live together in `src/shared/protocol.ts`.

| Type | Other fields |
|---|---|
| start | provider: local or gemini; model: string |
| reasoning_delta | text: string, separately supplied reasoning only |
| answer_delta | text: string |
| finish | outcome: completed, incomplete, or blocked; reason: string; optional usage |
| error | code: string; message: safe actionable string |

Usage contains nonnegative promptTokens, completionTokens, and totalTokens. No usage field means it was unavailable, not zero.

A synthetic provider chunk and its application frame:

```json
{"choices":[{"index":0,"delta":{"content":"Use const"},"finish_reason":null}]}
```

```text
data: {"type":"answer_delta","requestId":"example-1","text":"Use const"}

data: {"type":"finish","requestId":"example-1","outcome":"completed","reason":"stop"}

```

A usage-only chunk can have `choices: []`. A finish reason of `length` maps to incomplete; `content_filter` maps to blocked. Empty successful answers and unexpected stream termination become errors. The application emits one terminal event. Errors before SSE begins use an HTTP error status and a JSON `error` string. Errors after it begins use the typed error event and preserve partial content.
