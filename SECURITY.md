# Security and protected deployment

This application supports trusted local use and a single owner's protected access. It does not provide multiple user accounts. Authentication, request guards, quota storage, and browser headers were added after the original local-only v1 security review.

## Local development

`npm run dev` continues to use Local/Ollama by default. Local mode accepts only loopback connection addresses and the exact `localhost`, `127.0.0.1`, or `[::1]` hostnames. Unexpected, malformed, and duplicate Host headers are rejected. Browser Origins must match the request origin or the two built-in Vite development origins on port 5173. Foreign origins, cross-site Fetch Metadata, and same-site subresources without an allowed Origin are rejected before parsing or accounting.

Local mode trusts processes on your machine. It is not a password-protected public service. Keep Vite, the Express local preview, and Ollama private. Do not use a tunnel or proxy that publishes local mode while rewriting requests to a loopback Host.

The Ollama model, tuning, SDK selection, and Gemini model setting are unchanged. No provider is selected as an automatic fallback.

## Owner authentication

Set these variables in ignored server configuration before production startup:

```dotenv
ACCESS_MODE=protected
AUTH_USERNAME=your-owner-name
AUTH_PASSWORD=
PUBLIC_ORIGIN=https://your-chat-domain.example
SECURITY_STATE_PATH=.local/security.sqlite
```

Generate a random password locally, for example with `openssl rand -hex 32`, and put its output in `AUTH_PASSWORD`. Do not commit the result, reuse a provider key as the password, or prefix it with `VITE_`. The empty value above deliberately cannot start production. Passwords require 32–256 printable non-space ASCII characters; usernames accept 1–64 letters, digits, underscores, or hyphens. Password length is a minimum check, not a measurement of randomness.

`PUBLIC_ORIGIN` is an exact origin. It has no username/password, path, query, fragment, or trailing slash. Production requires HTTPS. Protected HTTP is allowed only on a loopback origin outside production for fixtures and local testing.

Run `npm run build`, then `npm start`. Startup refuses local access mode, weak/missing credentials, an invalid origin, and an in-memory security database. The start command forces production policy even if `.env` contains `NODE_ENV=development`. Every route and static asset requires authentication in protected mode, including health/config and Gemini generation. The browser supplies credentials through its native HTTP Basic prompt; the application does not create browser-stored credentials or a custom login page. HTTP Basic requires TLS for public traffic because Base64 is not encryption.

Only the configured owner credentials authorize access. Arbitrary Authorization values, malformed Base64, or an attacker-supplied forwarded Host/IP do not grant access. The server compares fixed-size credential digests with a constant-time operation. Authentication failures do not consume the owner's accepted-generation allowance. Requests without credentials receive the initial browser challenge and do not count as password guesses. Correct owner credentials remain usable after rejected guesses. The failed-authentication threshold returns 429 for further incorrect credentials; it is not a hard cap on credential verification. Use a strong random password and gateway ingress limits. Same-site image/frame requests can carry a browser's cached credentials, so request-origin/Fetch Metadata checks run before authentication and counters.

HTTP Basic does not provide an app-level logout, account recovery, MFA, or separate identities for multiple people. For those requirements, use an authenticated access gateway or design a later account/session stage. Cookie-based sessions will need their own CSRF controls.

## Persistent resource limits

Security state uses [Node's built-in SQLite module](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html), requiring Node 22.13 or newer. This API may emit an experimental-feature warning; verification uses Node 24. The state file is created with owner-only permissions. Keep its directory private, writable by the service user, outside served assets, and on local storage that supports SQLite locking.

| Setting | Default | Enforcement |
|---|---|---|
| `HTTP_RATE_LIMIT` | 120/minute | Allowed HTTP requests per owner/local caller, before JSON parsing, including malformed bodies and static requests |
| `AUTH_FAILURE_LIMIT` | 20/minute | Incorrect-credential responses per connection address before 429; excludes initial challenges and correct credentials |
| `RATE_LIMIT` | 10/minute | Accepted generation requests per authenticated/local principal |
| `DAILY_TOKEN_LIMIT` | 100000/provider/day | Conservative input estimate plus full output cap reserved before an upstream call, resetting at UTC midnight |

One generation per provider is allowed across processes sharing the same database. Local and Gemini use separate generation slots and daily allowances. Different callers have separate request-rate counters while the provider budget remains a total spending safeguard. This app has one authenticated owner, so people sharing that password also share that identity and its allowance.

Reservations are committed atomically before provider calls and are never refunded for cancellation, failure, or partial output. This intentionally overcounts many requests. Reasoning and answer output share the provider cap. The allowance constrains generation requested through this app; it is not an exact dollar limit, proof of actual provider usage, or protection against spending elsewhere with the same provider account. Configure provider-side quotas/spending controls and alerts too.

Preserve the database across service restarts. Deleting it or using a different path resets counters. Multiple Node processes on one instance must use the same database path. Separate cloud instances cannot coordinate through separate files; use a shared quota/coordination service before adding multiple hosts. In-memory state is permitted for isolated tests, never production.

Abandoned generation leases expire after the overall generation deadline plus a ten-second cleanup allowance. Clean shutdown aborts connections and lets provider iteration unwind before closing the database. If a provider does not unwind, shutdown has a five-second forced-exit fallback; the conservative reservation remains and the lease expires later. Unavailable security state rejects requests with a safe 503 instead of allowing unaccounted generation. Storage failures never return internal errors or credentials to the browser.

## Browser and HTTP safeguards

The built page receives a CSP restricted to its own scripts/styles/connections, with no inline/eval script permission, no objects, no base URL overrides, and `frame-ancestors 'none'`. Other headers deny framing, disable MIME sniffing, restrict cross-origin resource/opener behavior, disable camera/microphone/geolocation, and suppress referrers. Protected HTTPS configuration adds HSTS; local HTTP does not. Responses are not cached. Model HTML remains disabled, images are omitted, unsafe link protocols are filtered, and generated code is never executed.

JSON bodies are capped at 128 KB, including after decompression. Roles, ordering, fields, budgets, and request IDs are validated. SDK retries are disabled, generation deadlines remain bounded, and disconnects abort upstream work. The production entry point sets a 15-second header timeout, a 30-second incoming-request timeout, at most 128 connections, and at most 100 requests per connection. These application safeguards do not replace ingress flood protection.

## Cloud requirements before public access

No live instance, proxy, cloud firewall, or IAM policy was configured by this change. Complete and verify these on the actual deployment:

1. Terminate TLS at a reverse proxy or access gateway. Forward only to the loopback Express server. Preserve Host as the exact configured public host and preserve Authorization, Origin, and Fetch Metadata. Reject unrecognized virtual hosts. Do not log Authorization or secrets in URLs. Basic credentials must never travel over public plaintext HTTP.
2. Publish only the HTTPS gateway. Keep backend port 3001, development port 5173, and Ollama port 11434 private. Restrict administrative access in cloud security groups and the host firewall.
3. Run Node and Ollama as dedicated unprivileged service users. Restrict filesystem access and secret-file permissions. Do not mount the Docker socket or give the app unnecessary cloud/host privileges. Patch the OS, Node, Ollama, and npm dependencies.
4. Set service CPU/memory/file-descriptor limits, ingress connection/request/body limits, log rotation, restart policy, and cost alerts. Keep the security-state directory persistent and writable only where needed.
5. Give the instance no cloud role unless required; otherwise use minimum permissions and the provider's instance-metadata protections. Provider URLs and keys remain server-controlled, but infrastructure protections still limit damage from future bugs.
6. Re-test externally without credentials, with incorrect credentials/Host/Origin, and with valid owner access. Verify HTTP redirects/TLS, certificate renewal, cancellation/streaming through the proxy, private ports, and quota behavior after restart. Hosted proxy behavior was not fixture-verified by the local application tests.

## Verification

`npm run check` runs lint, types, deterministic fixtures, the production build, and authenticated desktop/mobile browser workflows. `npm run format:check` checks source formatting. Security regressions cover unauthorized/malformed authentication, Host/Origin and same-site request rejection, pre-parser limits, safe storage failures, persistent/cross-process quotas, UTC resets, separate callers/providers, lease ownership/expiry, and shutdown cleanup. Tests use synthetic credentials and fake providers. No routine test consumes live Gemini or Ollama generation.

Run `npm audit` for current known dependency advisories. A clean advisory scan and passing tests establish the checks performed; they do not certify future code or infrastructure changes. Reassess access control and quotas when adding accounts, storage, additional instances, tools, retrieval, or code execution.
