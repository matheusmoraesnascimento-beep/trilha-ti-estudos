const TZ_DEFAULT = 'America/Sao_Paulo';

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(s) {
  return new Date(`${s}T00:00:00Z`).getUTCDay();
}

export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function todayIn(tz = TZ_DEFAULT, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p;
}

export function isStudyDay(s, { weekdays = [1, 2, 3, 4, 5], holidays = [] } = {}) {
  return weekdays.includes(weekday(s)) && !holidays.includes(s);
}

export function nextStudyDay(s, opts) {
  let d = addDays(s, 1);
  for (let i = 0; i < 400 && !isStudyDay(d, opts); i++) d = addDays(d, 1);
  return d;
}

export function prevStudyDay(s, opts) {
  let d = addDays(s, -1);
  for (let i = 0; i < 400 && !isStudyDay(d, opts); i++) d = addDays(d, -1);
  return d;
}

export function formatBR(s) {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function formatShort(s) {
  return formatBR(s).slice(0, 5);
}

export function countdown(examDate, today) {
  return Math.max(0, diffDays(today, examDate));
}

export function weekStart(s) {
  const w = weekday(s);
  return addDays(s, -((w + 6) % 7));
}
