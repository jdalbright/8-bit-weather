# Native AI briefings: Apple Intelligence with OpenAI fallback

## Dependency and release boundary

The iOS app uses Apple's on-device Foundation Models first on eligible iOS 27+ devices. The rest of the app still supports iOS 17. iOS 26 and older use OpenAI when online; the iOS 26 model is intentionally disabled after mixed quality in local evaluation. If Apple Intelligence is unavailable or generation fails on iOS 27+, the app automatically tries OpenAI once when online. The website continues using OpenAI. See [Apple integration and verification](ios-apple-briefing.md).

Apple generation needs no server configuration. The **OpenAI fallback** uses the configured native endpoint and native-compatible production backend. Its deployment was approved and completed on September 11, 2026; live native simulator verification passed. The signed app is also installed on the connected iPhone, where a live OpenAI briefing test passed; see [physical verification](ios/evidence/iphone-development/README.md).

### Connection setup (September 11, 2026)

The packaged app now loads the public endpoint from the checked-in `.env.native` file. Ordinary `npm run ios:sync` builds retain this connection; `.env.native.local` can override it for local testing. No OpenAI key is downloaded or embedded in the app. Website builds retain their same-origin route.

Before deployment, non-generating checks found that the old backend accepted the empty forecast far enough to return `400 invalid_forecast`, but its native preflight returned `405 method_not_allowed` without native CORS headers. The deployment below resolved this compatibility blocker without replacing or exposing the existing OpenAI key.

**Deployed with explicit approval:** production deployment `dpl_GJg4JmuXWvXJXg471mRQq6YAfUVr` is Ready and serves [8-bit-weather.vercel.app](https://8-bit-weather.vercel.app). The server setting `WEATHER_BRIEFING_NATIVE_ORIGINS=capacitor://localhost` is enabled. The existing server key, model configuration, activation setting, and firewall rule were preserved. No Git push or store submission was performed. Apple development signing was subsequently approved and completed for the physical-device test.

The production deployment checked was `dpl_Co8P9VmVEUW76R7qz17uf1uLE9Nd`, sourced from `d8442917ddbdb59ceafe2ae8b6aad0236e767d5a`. An isolated candidate at `/tmp/eightbit-native-api-release-d844291` preserves that exact website source (including its newer sunrise/sunset feature) and changes only `server/briefing.ts`, its tests, `scripts/check-server.mjs`, and the added `src/lib/briefing-prompt.ts`. The review diff is `/tmp/eightbit-native-api-release.patch`. Recheck the active production revision before deploying this candidate.

Candidate validation: 171 frontend tests and 37 server tests passed, three paid tests skipped, native Node ESM smoke passed, and production build passed. In the iOS worktree, 47 client/Apple tests and 37 server tests passed; native sync, bundle secret checks, and signed simulator compilation passed. The real backend URL was verified in the native bundle, copied Capacitor assets, and compiled simulator app. No API key was read or copied.

Live verification: homepage `200`; native preflight `204` with exact `capacitor://localhost` access; untrusted-origin preflight `403` without access; invalid native forecast `400` with readable CORS headers; source-file alias `404`; one synthetic OpenAI briefing `200` with the expected version and word limit. The actual native simulator app then received and displayed a separate real OpenAI briefing through its WKWebView. [HTTP results and native screenshot](ios/evidence/native-api-production/) record these checks. A subsequent physical iPhone test independently passed the live OpenAI briefing check; [device evidence](ios/evidence/iphone-development/README.md) records its scope.

The unchanged production firewall was exercised with invalid empty forecasts (no provider calls): ten returned `400`, then the 11th returned `429`. The edge response omitted CORS and `Retry-After` headers. WKWebView therefore sees a network failure for this edge case and uses the existing generic recoverable-error cooldown; function-generated rate-limit responses remain readable through CORS. [Rate-limit evidence](ios/evidence/native-api-production/rate-limit.json).

This was a direct deployment of the isolated snapshot. The four backend/supporting source changes remain local and have not been pushed to GitHub. A future Git-triggered deployment must include them to preserve native API support.

The web app continues to use the same-origin `/api/weather-briefing` route. The iOS package has no serverless backend at `capacitor://localhost`, so its OpenAI fallback must have a public HTTPS endpoint configured explicitly:

```sh
VITE_NATIVE_BRIEFING_URL=https://8-bit-weather.vercel.app/api/weather-briefing npm run ios:sync
```

`VITE_NATIVE_BRIEFING_URL` is a public URL, never a provider credential. It must use HTTPS and the canonical `/api/weather-briefing` path, without user information, query, or fragment. Requests omit cookies and reject redirects. Missing or invalid configuration produces a recoverable error only when cloud fallback is needed; Apple generation, forecasts, and cached briefings remain available.

The native backend configuration is opt-in:

```dotenv
WEATHER_BRIEFING_NATIVE_ORIGINS=capacitor://localhost
WEATHER_BRIEFING_ENABLED=true
OPENAI_API_KEY=<server-only secret>
```

`WEATHER_BRIEFING_NATIVE_ORIGINS` accepts a comma-separated list of exact origins. Keep it as narrow as the actual Capacitor `server.iosScheme` and `server.hostname` configuration. No wildcard, opaque `null` origin, credentials, trailing slash, or path is accepted. HTTPS origins are also supported for explicitly configured native hosts. Existing same-origin web requests still work; native access defaults to denied. The origin header is a browser boundary, not authentication: non-browser clients can forge it. Existing endpoint activation and WAF requirements remain necessary.

## Server protections

- Only the canonical path is accepted, including for preflights; aliases stay rejected before generation.
- CORS permits only configured origins, `POST`, and `Content-Type`. `OPTIONS` has no provider call and does not require a provider key.
- Native success and function error responses carry the exact allowed origin. `Retry-After` is exposed so the client can honor provider cooldowns across places/units.
- Disabled/missing-key gates, 12 KB stream/body limit, forecast validation/freshness, bounded provider timeout, no automatic provider retry, server-selected model/instructions, and metadata-only logs remain in place.
- The existing Vercel WAF rule in `config/firewall/weather-briefing.json` still covers **all** POST requests on the canonical route: 10 per minute per IP. OPTIONS cannot generate a briefing or bypass that rule. No client key or native-only unprotected route is added.
- Platform-generated WAF responses occur before this function. If the deployed WAF omits CORS headers on a blocked response, WKWebView exposes a network error rather than readable 429 metadata. The client still stops automatic retries and uses its recoverable-error cooldown. Verify WAF CORS behavior during the separately approved production rollout; do not claim that function CORS alone changes edge responses.

## Cached and offline behavior

Briefing cache reads/writes use the shared persistence adapter. In iOS the adapter hydrates Capacitor Preferences before rendering, providing durable cached summaries; web retains localStorage. Briefings remain scoped to location and units and are reused offline only within their supported 24-hour window. Clearing saved data removes the shared briefing cache and aborts pending work. Fresh, complete cached forecasts can also generate a new Apple briefing offline. OpenAI is never requested offline. Optional `provider: apple | openai` metadata identifies new summaries; legacy entries without it remain valid. No cross-device sync is added.

## Reproducible local verification

No provider credentials, charges, or deployment are needed for the compatibility tests:

```sh
npx vitest run --config vitest.server.config.ts server/briefing.test.ts
npx vitest run src/lib/briefing-client.test.ts src/hooks/useBriefing.test.tsx
node scripts/check-server.mjs
```

Server tests mock OpenAI and exercise preflight, exact origin rejection, unsafe allowlist values, native successes and failures, route aliases, body/freshness guards, and exposed cooldowns. Client tests verify web/native routing, safe HTTPS configuration, missing configuration, request credentials/redirect policy, and shared rate-limit cooldowns. Existing hook tests cover cached/offline summaries and request lifecycle.

Local results on September 10, 2026: 37 server tests passed; 23 client/hook tests passed; native Node ESM function smoke check passed; server and app TypeScript checks and scoped ESLint passed. These are local compatibility checks with mocked provider responses, not production or physical-device results.

The native-compatible backend and exact origin setting are now deployed, and live API/native simulator checks passed as recorded above. The signed physical iPhone app also displayed a real OpenAI briefing in the passing opt-in device test. Actual iOS 27 Apple output still requires a compatible runtime or device.
