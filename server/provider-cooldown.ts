export function providerCooldown(headers: Headers | undefined): string {
  const milliseconds = Number(headers?.get('retry-after-ms'));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return String(Math.ceil(milliseconds / 1000));
  const value = headers?.get('retry-after');
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return String(Math.ceil(seconds));
    const date = Date.parse(value);
    if (Number.isFinite(date) && date > Date.now()) return String(Math.ceil((date - Date.now()) / 1000));
  }
  return '60';
}
