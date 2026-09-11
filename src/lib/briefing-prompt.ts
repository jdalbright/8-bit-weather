const factualInstructions = `Write an English weather briefing for the supplied 24-hour window using ONLY the supplied hourly forecast. Give 2–3 sentences, at most 75 words, in plain text. Cover the temperature trend/range, precipitation timing and chance, and notable changes only when the data supports them. The listed precipitation probability belongs to its displayed interval. Missing values are unknown, never zero. Preserve uncertainty: probability is not a promise. Do not invent amounts, wind forecasts, warnings, official alerts, or exact onset times. Do not extrapolate outside the supplied window. Use the supplied local day/time labels and temperature unit. Avoid relative phrases like "in an hour" that become misleading in a cached summary. Include one everyday practical takeaway if justified. No heading, markdown, greeting, sign-off, or mention of being an AI.`;
const personalities = { 'warm-practical': 'Speak warmly and naturally, like a helpful neighbor. Use simple dayparts such as this evening, overnight, and tomorrow afternoon; avoid full dates, timezone abbreviations, and unnecessary minute precision. Focus on the most useful change, not an inventory of intervals. Group low precipitation chances together instead of listing every small peak. Never say "supplied window", "listed intervals", or describe your input data. Keep advice practical and restrained; no game jargon, jokes, or alarmism.' };

export const briefingInstructions = `${factualInstructions}\n${personalities['warm-practical']}`;
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export function validSummary(text: string): boolean {
  if (!text || text.length > 1600 || text.split(/\s+/).length > 75) return false;
  const sentences = [...sentenceSegmenter.segment(text)].filter(part => part.segment.trim());
  return sentences.length >= 2 && sentences.length <= 3;
}

export const appleBriefingInstructions = `Write two conversational English sentences, 35–55 words total, about the next 24 hours. Use only the calculated facts.
Speak directly about the weather, never about how the input describes it. First describe the temperature trend and how it will feel, using °F or °C and the natural daypart labels. Do not repeat temperatures. For steady temperatures give just the steadyAt temperature; otherwise connect the high and low in time order. Start the second sentence with "Rain chances" and summarize their peak percentage and peak periods. A chance is not a promise or an exact onset time.
Follow coverage: explicitly mention missing rain data when precipitation is incomplete, and qualify temperatures as available readings when temperature is incomplete. Otherwise do not mention missing data. Never invent conditions, wind, rain amounts or warnings. Advice is optional; omit generic clothing suggestions. No greeting, headings, lists of readings, or phrases like "during the period" or "plan for variable conditions". Maximum 75 words.`;
