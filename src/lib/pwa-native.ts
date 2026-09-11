/** Build-time alias: native packages never register a web service worker. */
export function useRegisterSW() {
  return { needRefresh: [false, (_value: boolean) => { void _value; }] as const, updateServiceWorker: async (_reload?: boolean) => { void _reload; } };
}
