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

## Exact request rules

`requestId` is 1–80 ASCII letters, digits, or hyphens. `provider` is `local` or `gemini`. `thinking` is a boolean and defaults to false if omitted. The message array must have an odd length between 1 and 101, alternate user and assistant, and end with user. Content is trimmed and must contain 1–24,000 characters after trimming. Unknown fields at request and message level are rejected. These limits apply before the provider call.

The estimated local input budget is 2,816, counting UTF-8 bytes plus 16 per message and the server prompt. Gemini uses a separate 24,000 estimated-input budget. HTTP 413 reports body or context overflow, with no silent trimming. Reasoning text never belongs in the message array.

## Reasoning and usage examples

Both identified fields can be supplied together:

```json
{"choices":[{"delta":{"reasoning":"Consider the binding.","content":"Use const for a binding you do not reassign."},"finish_reason":null}]}
```

The server emits `reasoning_delta` then `answer_delta`. It also accepts the separately identified `reasoning_content` field; if both reasoning names exist, `reasoning` takes precedence. It never splits guessed reasoning markers out of answer text.

A trailing usage-only provider chunk:

```json
{"choices":[],"usage":{"prompt_tokens":60,"completion_tokens":42,"total_tokens":102}}
```

This becomes `usage: {"promptTokens":60,"completionTokens":42,"totalTokens":102}` on the final application event. The server waits until the provider iterator ends before emitting that event.

## Errors and terminal handling

Before streaming, invalid input returns 400, body/context overflow 413, a busy provider 409, application rate limiting 429, and missing Gemini configuration 503. The body is an object containing an actionable `error` string. These checks make no generation request.

After streaming begins, a synthetic timeout frame looks like:

```text
data: {"type":"error","requestId":"example-1","code":"idle_timeout","message":"The provider stopped sending data. Partial output is preserved; retry explicitly."}

```

| Error code | Meaning |
|---|---|
| first_activity_timeout | No provider chunk arrived before the first deadline |
| idle_timeout | The provider stopped producing chunks |
| overall_timeout | The whole generation exceeded its deadline |
| quota | Provider HTTP 429; explicit retry only |
| credentials | Provider HTTP 401 or 403 |
| model_unavailable | Provider HTTP 404 |
| provider_unavailable | Other provider connection or service failure |
| malformed_stream | Invalid provider JSON or incompatible chunk shape |
| unexpected_end | Provider iteration ended with no finish reason |
| empty_answer | Normal stop with no nonempty answer |

The browser validates application event shapes, ignores IDs that do not match its current request, and closes its reader after one matching terminal event. EOF without one is a connection failure. The reducer separately rejects updates after completion, failure, incomplete output, or Stop. This second check protects state even if another caller misroutes an event.

`GET /api/health` returns `{"status":"ok"}`. `GET /api/config` returns public provider name/model/availability and the numeric limits. Its schema also lives in `src/shared/protocol.ts`. Neither endpoint tests provider generation or returns credentials.
