/** “刚刚 / 12 分钟前 / 3 小时前 / 昨天 / 4 天前 / 月日” for the history list. */
export function formatWhen(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return `${Math.floor(s / 3600)} 小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const d = new Date(at);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
