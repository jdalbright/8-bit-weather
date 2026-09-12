import { handleWeather } from '../server/weather.js';
export const maxDuration = 20;
export default { fetch: handleWeather };
