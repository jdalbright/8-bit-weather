// Conditional guidance based on https://www.weather.gov/safety/lightning-safety-overview.
// The forecast may justify offering this advice, not claiming a storm is certain.
export const THUNDERSTORM_TAKEAWAY = 'If you hear thunder, move into a substantial building or an enclosed hard-topped vehicle.';

export const briefingInstructions = `Write a warm, natural English weather briefing about the next 24 hours using ONLY the calculated forecast facts and the supplied conditional safety takeaway. Help someone understand the main change and when it matters. Use connected plain-text sentences, usually one or two short paragraphs. Around 80–160 words is a useful guide, not a hard limit: give more explanation when changing weather warrants it, and keep quiet weather shorter. There is no fixed sentence count. Do not pad, repeat yourself, or cut off a useful explanation or recommendation to hit a length target.

Follow lead: start with forecast snow or thunderstorms when present, otherwise meaningful precipitation timing, otherwise the temperature story. Cover temperatures and precipitation concisely. For a changing temperature timeline, connect the low and high in chronological order and mention the return toward warmer or cooler weather only when useful; never imply an uninterrupted trend across a reversal. For steady temperatures, give steadyAt once without claiming warming or cooling. Use the supplied temperature unit, with °F or °C on every temperature or temperature range.

Precipitation percentages are the highest HOURLY chances within each daypart, not a probability for that entire daypart or day. Describe chances reaching their peak, never the probability of any rain over the whole window. For low-chances, give one short statement such as "Rain chances stay low, peaking at 20%." Do not enumerate dayparts, invent peak timing, or repeat the forecast window in that statement. At 0% with complete precipitation coverage, simply say "Precipitation is not expected" rather than "reaching no higher than 0%". With incomplete precipitation coverage, qualify low chances as available readings and explicitly state the gap; never conclude that precipitation is not expected across the window; missingPeriods describes gaps, not rain peaks. Name peak dayparts for higher chances. Conditions determine whether to say rain, snow, or thunderstorms; use precipitation for mixed or unknown types. Forecast chances and condition codes are not promises, warnings, or exact onset times. Do not claim guaranteed dry weather even at 0%.

Use natural local daypart labels exactly as provided. Keep the story within from/until; avoid clock times, dates, timezone abbreviations, and aging phrases like "in an hour". Mention meaningful condition changes, not every cloud variation. Missing values are unknown, never zero: if temperature coverage is partial, qualify it as available readings; if unavailable, say temperature data is unavailable. For partial precipitation coverage, use the explicit phrase "precipitation data is incomplete"; for unavailable coverage, say it is unavailable. Never claim missing data when coverage is complete, or that all data is absent when only part is missing.

Include useful practical recommendations tied to concrete forecast events. If thunderstormTakeaway is present, copy that supplied sentence exactly when giving storm-safety advice. Never mention umbrellas or rainwear in a thunderstorm briefing, even for a different shower period; never offer them as an alternative to safe shelter. Do not invent other thunderstorm safety advice. Without thunderstorms, carrying an umbrella can be appropriate for forecast showers. Clothing recommendations can be useful for a meaningful temperature change; omit generic advice like "plan for variable conditions". Do not invent wind, feels-like temperatures, UV, amounts, hazards, warnings, or official alerts. No heading, markdown, greeting, sign-off, game jargon, jokes, alarmism, or commentary about your input or being an AI.

Examples of style (illustrative facts only; never reuse their numbers unless present in the actual forecast):
Facts: this morning through tomorrow morning; steadyAt 72°F; complete data; clear skies throughout; peak hourly precipitation chance 10%.
Briefing: Temperatures stay near 72°F through tomorrow morning, with clear skies and little change along the way. Rain chances stay low, peaking at 10%.
Facts: complete data; showers tomorrow afternoon with a peak hourly chance of 70%; chronological low 58°F overnight, high 76°F tomorrow afternoon.
Briefing: Showers are most likely tomorrow afternoon, with rain chances reaching 70%, so keep an umbrella handy. Temperatures dip to 58°F overnight before warming to 76°F tomorrow afternoon.
Facts: complete data; snow this evening then cloudy overnight; peak hourly precipitation chance 80% this evening; temperatures fall from 30°F this evening to 24°F overnight.
Briefing: Snow is in the forecast this evening, with precipitation chances reaching 80%, before cloudy skies take over overnight. Temperatures fall from 30°F this evening to 24°F overnight.
Facts: complete data; thunderstorms this evening with a peak hourly precipitation chance of 80%; temperatures fall from 77°F this afternoon to 66°F tomorrow afternoon; thunderstormTakeaway supplied.
Briefing: Thunderstorms are most likely this evening, with precipitation chances reaching 80%. Temperatures fall from 77°F this afternoon to 66°F tomorrow afternoon. ${THUNDERSTORM_TAKEAWAY}`;
export const MAX_BRIEFING_TEXT_LENGTH = 6000;

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export function validSummary(text: string): boolean {
  if (!text || text.length > 1600 || text.split(/\s+/).length > 75) return false;
  const sentences = [...sentenceSegmenter.segment(text)].filter(part => part.segment.trim());
  return sentences.length >= 2 && sentences.length <= 3;
}

export const appleBriefingInstructions = `Write a brief weather update with exactly two natural sentences. No headings or field labels. Return only the update.
First describe temperature. If steadyAt is present, say temperatures stay near that value, without adding a high or low. For a partial temperature forecast, begin with "Available temperature readings". If temperature coverage is unavailable, say "Temperature data is unavailable." Otherwise connect the supplied high and low in time order using their dayparts. Keep the exact numbers and units.
For the second sentence, copy precipitation.statement exactly. Do not explain, expand, or reinterpret that sentence. Do not add any other data-availability claims, conditions, precipitation types, advice, or warnings. Use no more than 65 words.`;
