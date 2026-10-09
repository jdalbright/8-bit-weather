# GPT-6 Luna migration

Prepared October 9, 2026. This is a local migration; deployment and production environment changes are separate steps.

## Runtime changes

Both weather briefing and outdoor recommendation endpoints default to `gpt-6-luna`.
`OPENAI_WEATHER_MODEL` remains an operator override shared by both endpoints. Requests
still use Responses, `reasoning: { effort: 'none' }`, `store: false`, a 12-second SDK
timeout, zero retries, and 1,000/350 output tokens for briefing/outdoor respectively.
No tools or weather search are enabled. No SDK upgrade is required by this change.

Briefing prompt revision `7:gpt6-partial-zero-coverage` makes factual accuracy, uncertainty,
chronology, advice, and style priorities explicit. It adds partial-coverage and
cooling/rebound examples, separate unavailable-measurement statements, exact qualified
wording for partial coverage with a zero-percent peak, and a final fact check. Existing hourly probability semantics,
unit/daypart rules, conditional thunderstorm advice, and runtime validators remain.
Outdoor prompt revision `2:gpt6-ranked-choice` explicitly selects the first of the
server-ranked windows, keeping the AI choice consistent with the local recommendation.
It retains the existing JSON schema and qualitative, single-sentence explanation.

Apple Intelligence, forecast calculations, API wire versions, and cache behavior are
unchanged. Server prompt revisions are diagnostic metadata, not client cache keys;
existing cached OpenAI output can remain until its normal expiry/offline lifetime.

## Controlled comparison

With an existing server-side key and authorization for up to 42 paid requests:

```sh
npm run test:weather:migration
```

Normal `npm test` skips this evaluation even when a key is present. The comparison
ignores `OPENAI_WEATHER_MODEL` intentionally and fixes three variants:

| Variant | Model | Prompt |
| --- | --- | --- |
| baseline | `gpt-5.6-luna` | Frozen pre-migration prompt |
| model-only | `gpt-6-luna` | Same frozen prompt |
| revised | `gpt-6-luna` | Revised production prompt |

Each of 14 synthetic cases uses identical calculated facts, reasoning, output budget,
timeout, and storage policy across variants. Request order rotates across the three
variants. The 11 briefing cases cover steady weather, temperature reversals, warming,
low chances, showers, snow, thunderstorms, incomplete data, metric incomplete data,
unavailable measurements, and a midnight/DST reversal. Three outdoor cases cover
ties, heat tradeoffs, and ranking priorities. No actual user location is sent.

Reports are written incrementally to a unique temporary `comparison.json`, whose path
is printed. Reports retain generated text, facts, requested/returned models, status,
validator acceptance, outdoor rank agreement, timing, and token usage. Provider errors
are reduced to HTTP status only. Any request failure stops the run without retries;
preserve that report rather than discarding it. Invalid completed outputs remain in the
report and are not automatically retried. Completing the test means collection succeeded,
not that the quality gate passed.

Manually check every final candidate for factual accuracy, chronology, probability
meaning, missing-data qualification, useful advice, and natural prose. Require all 14
revised outputs to pass runtime checks, all three outdoor choices to match the top-ranked
hour, and no unsupported claims. Compare quality with both other variants and report
latency, token use, and cost tradeoffs; do not assume a model upgrade improved them.
The 12-second timeout must remain viable. This small sample cannot establish production
p95 latency or guarantee all future output.

The older `test:briefing:compare` command intentionally keeps its historical model
default and original prompt/fact-pipeline comparison. It is not the migration evaluation.

After a justified prompt correction, `WEATHER_MIGRATION_REVISED_ONLY=true npm run
test:weather:migration` collects 14 revised-only requests. Preserve the original report,
explain the correction, and review every fresh candidate; do not present this as a new
paired baseline run. Successful outputs also record the exact prompt SHA-256.

## Evaluation results — October 9, 2026

Saved synthetic evidence includes the [initial network failure](evidence/openai-briefing/gpt6-migration-2026-10-09/00-network-failure.json),
[42-request comparison](evidence/openai-briefing/gpt6-migration-2026-10-09/01-three-way-comparison.json),
[14-request coverage follow-up](evidence/openai-briefing/gpt6-migration-2026-10-09/02-coverage-followup.json),
and [14-request final validation](evidence/openai-briefing/gpt6-migration-2026-10-09/03-final-validation.json).
There were 70 completed generations across three runs, plus one connection failure before
network access was available. Reports retain every output and rejection.

| Run / variant | Runtime accepted | Median latency | Maximum latency |
| --- | --- | --- | --- |
| Original GPT-5.6 Luna baseline | 14/14 | 1.73 s | 3.37 s |
| GPT-6 Luna, original prompt | 13/14 | 1.57 s | 2.49 s |
| GPT-6 Luna, initial revised prompt (revision 5) | 13/14 | 1.44 s | 1.97 s |
| GPT-6 Luna, coverage follow-up (revision 6) | 13/14 | 1.40 s | 1.71 s |
| GPT-6 Luna, final prompt (revision 7) | 14/14 | 1.24 s | 1.90 s |

The first comparison exposed a validator mismatch when the model combined unavailable
temperature and precipitation into one sentence. Revision 6 required separate statements
and qualified partial-daypart gaps. Its follow-up exposed an unsupported "no chance"
paraphrase for zero-percent available readings with incomplete coverage. Revision 7
requires a qualified numeric sentence for that case. Validators were not weakened.

All final outputs were manually checked against their facts, and all three outdoor
choices matched the top-ranked hour. Final output totaled 682 tokens versus the original
baseline's 818; final input totaled 19,875 versus 15,384 because the prompt is longer.
The final run reported 14,050 cached input tokens, while the baseline reported none;
latency differences are descriptive, not a controlled performance guarantee. No reasoning
tokens were reported. The snow sample still offered an umbrella, an editorial weakness
also present in the original baselines; the final weather facts and uncertainty were
supported. The final run followed prompt corrections and was not a fresh paired baseline.

## Rollout and rollback

Local verification passed: 513 client tests, 215 server tests (five live tests skipped
in the ordinary suite), the native Node ESM function smoke check, lint, TypeScript checks,
and the production build. All 18 briefing/outdoor Chromium and WebKit regression tests
passed. The build retains its existing large-chunk warning. No native Swift code or Apple
prompt changed. Changed-file credential-pattern and whitespace checks passed.

Before release, review the completed comparison and verify preview model access and
fresh API responses for both briefing and outdoor requests. An existing deployment
override can still select the old model even after the source default changes.
Set the target environment's `OPENAI_WEATHER_MODEL=gpt-6-luna` and redeploy only after
deployment authorization. Verify server model/revision metadata and freshly generated
results; cached output is not migration evidence.

For model-only rollback, set `OPENAI_WEATHER_MODEL=gpt-5.6-luna` and redeploy. For full
behavior rollback, redeploy the prior code plus its model configuration; the environment
override alone does not restore the previous prompts. Preserve existing feature gates,
firewall rules, cache lifetimes, and native response formats.

Sources: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[migration guidance](https://developers.openai.com/api/docs/guides/latest-model#update-api-and-model-parameters),
and [prompting guidance](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices).
