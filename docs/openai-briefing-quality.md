# OpenAI briefing quality

The [September 11 live comparison](evidence/openai-briefing/2026-09-11-review.md)
completed all 16 calls. The candidate was preferred in six of eight pairs and used fewer
tokens, but failed the full quality gate because its thunderstorm advice offered an
umbrella as an alternative to safe shelter. Low-chance wording also remained repetitive.
The failed evaluation is preserved. Revision `4:fuller-explanations-coverage` retains
the storm-advice checks and removes rigid OpenAI length constraints.

The prompt uses server-calculated chronological temperature points,
daypart precipitation peaks, condition transitions, and separate measurement coverage.
It suggests 80–160 words as a guide, allows longer explanations and useful recommendations,
and imposes no fixed sentence count or hard word limit. The provider has a 1,000-token
output budget and the server/client reject abnormally oversized output above 6,000
characters. Neither layer truncates the text. Paragraph breaks are preserved. Apple
Intelligence retains its separate concise prompt and validation.

For precipitation peaks of 20% or less, the model receives the peak once and empty
`peakPeriods`/`periods` lists. Missing coverage retains a separate `missingPeriods` list;
condition changes and temperature timing are preserved. This removes the repeated
daypart inventory that the model copied in the failed evaluation. A zero-percent,
complete forecast can use "Precipitation is not expected"; incomplete coverage must
still be qualified. The server does not reject a useful summary solely for style.

For forecast thunderstorms (codes 95, 96, and 99), the model receives one optional
conditional shelter sentence, based on [NWS lightning guidance](https://www.weather.gov/safety/lightning-safety-overview).
The prompt permits either that exact takeaway or no advice. The server also rejects
umbrella, raincoat, poncho, rain-gear, or rainwear language anywhere in a thunderstorm
briefing, including mixed storm/shower forecasts. Ordinary shower-only briefings may
still suggest an umbrella. This bounded check blocks the observed failure; it is not
a comprehensive validator of every possible safety claim.

Offline regressions replay all eight saved candidate responses. The recorded storm
advice is now rejected, while the other seven remain valid. Tests also cover the 20/21%
boundary, missing-data timing, storm codes with low precipitation chances, safe optional
advice, ordinary showers, and storms outside the 24-hour window. The original live
comparison remains failed; it is historical evidence, not an evaluation of revision 4.
The saved Xweather rejection additionally replays a valid four-sentence explanation
with storm advice and a comma-linked missing-precipitation qualifier. Both now pass
without removing any prose or issuing another model request.

Two bounded live requests with revision 4 replayed that partial Xweather forecast.
Both completed and passed validation with recommendations and paragraph breaks intact;
[their outputs are saved](evidence/openai-briefing/2026-09-11-fuller-briefings.json).
This verifies the observed failure case, not every possible model response.

The OpenAI fact builder is separate from Apple Intelligence. The API wire format and
`BRIEFING_VERSION` remain unchanged for existing native clients. Previously cached
briefings retain the existing expiry/offline behavior. Server diagnostics record the
prompt revision and invalid-summary outcomes without logging prompts or generated prose.

Probabilities retain the provider's interval-end alignment. A daypart peak is the maximum
hourly chance, not a probability for the entire period. Missing values are never zero.
Temperatures come from the same rounding/conversion helper as the app. Steady means the
known temperature range is less than 2°C; other stories retain the start, extrema, and end
in chronological order, deduplicating repeated rounded values. Natural dayparts use the
forecast timezone: overnight before 06:00, morning before noon, afternoon before 18:00,
then evening. Labels use the clipped interval start, including partial first hours.

Runtime checks reject unsupported explicit numeric temperatures and probabilities,
incorrect units, false missing-data claims, unqualified incomplete coverage, and common
confident dry-weather claims when precipitation data is incomplete. These checks are
bounded: they do not prove semantic accuracy, timing, advice, or spelled-out numeric claims.
Model comparisons remain necessary before claiming a quality improvement.

## Local verification

Normal tests mock OpenAI or skip generation. They require no real key or paid requests:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npx playwright test tests/briefing.spec.ts
npx playwright test --config playwright.native.config.ts native-tests/briefing.spec.ts
```

## Opt-in paired evaluation

Run only after explicit authorization for 16 paid generation calls, with an existing
server-side `OPENAI_API_KEY` available in the environment. Never put a key in the command,
report, source control, or client bundle. Use the configured `OPENAI_WEATHER_MODEL` or the
existing default `gpt-5.6-luna` for both pipelines.

```sh
npm run test:briefing:compare
```

This runs eight deterministic synthetic forecasts against the frozen original prompt/raw
hourly facts and the new prompt/calculated facts. Forecast, reference time, model, reasoning,
token limit, timeout, storage setting, and retry policy match within every pair. Requests
are sequential, alternate baseline/candidate order, and never retry. Errors count as
failed samples. This harness calls the SDK directly so fixed historical fixtures can be
compared without weakening the endpoint's forecast freshness checks.

The console reports a unique temporary `comparison.json` path with generated text,
facts, acceptance checks, token usage, and latency. Review is initially pending; passing
the test means the report was collected, not that quality passed. CI skips this harness,
and the separate older `test:briefing:live` command is not run by it.

Review steady weather, overnight cooling/rebound, warming, low chances, timed showers,
snow, thunderstorms, and incomplete data. For each pair:

- Check temperatures, units, chronology, precipitation type/chance/timing, and uncertainty
  against the facts. Mark `candidateFactuallyCorrect` true only if all claims are supported.
- Choose `preferred` as `candidate`, `baseline`, or `tie` based on useful emphasis, natural
  wording, and repetition. Fill in those review fields and explain factual errors or awkwardness.
- Compare token usage and latency; report any increase alongside the quality result.

The acceptance gate is eight accepted, factually correct candidate outputs and candidate
preference in at least six of eight pairs. Ties and failed requests do not count as wins.
Preserve failures in the report; do not silently rerun until passing. A small evaluation is
evidence about these cases, not a guarantee across all weather. Paid evaluation and
production deployment are separate authorized steps. Local changes alone do not update
the website or installed iPhone's backend.

Approach references: [OpenAI prompting guidance](https://developers.openai.com/api/docs/guides/prompt-engineering)
and [evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices).
