import { addDays, isStudyDay, nextStudyDay, prevStudyDay } from './dates.js';

export const INTERVALS = [
  ['d1', 1], ['d3', 3], ['d7', 7], ['d15', 15], ['d30', 30], ['d45', 45],
];

export const DEFAULT_MINUTES = { d1: 15, d3: 20, d7: 20, d15: 20, d30: 25, d45: 30, pre: 30, extra: 15 };

function fit(date, start, exam, opts) {
  if (date >= exam) return null;
  let d = date;
  if (!isStudyDay(d, opts)) d = nextStudyDay(d, opts);
  if (d >= exam) d = prevStudyDay(date, opts);
  return d > start && d < exam ? d : null;
}

export function suggestReviews({ startDate, examDate, weekdays, holidays = [], intervals = INTERVALS }) {
  const opts = { weekdays, holidays };
  const byDate = new Map();
  const skipped = [];
  const add = (stage, date, reason) => {
    if (!date) return skipped.push({ stage, reason });
    const cur = byDate.get(date);
    if (cur) cur.mergedStages.push(stage);
    else byDate.set(date, { stage, date, mergedStages: [] });
  };
  for (const [stage, n] of intervals) {
    const date = fit(addDays(startDate, n), startDate, examDate, opts);
    add(stage, date, 'sem dia de estudo antes da prova');
  }
  const pre = prevStudyDay(examDate, opts);
  add('pre', pre > startDate ? pre : null, 'sem dia útil entre estudo e prova');
  return { reviews: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), skipped };
}

export function planSync(existing, suggested, today) {
  const byStage = new Map(existing.map((r) => [r.review_stage, r]));
  const create = [];
  const update = [];
  for (const s of suggested) {
    const cur = byStage.get(s.stage);
    if (!cur) create.push(s);
    else if (cur.status !== 'done' && cur.date >= today && cur.date !== s.date) update.push({ id: cur.id, date: s.date, stage: s.stage });
  }
  return { create, update };
}

export function extraReviewDate({ percent, selfRating, date, examDate, weekdays, holidays = [], existingReviewDates = [] }) {
  const low = (percent != null && percent < 70) || (percent == null && selfRating === 'hard');
  if (!low) return null;
  const d = nextStudyDay(date, { weekdays, holidays });
  if (d >= examDate) return null;
  return existingReviewDates.includes(d) ? null : d;
}

export function dayLoad(tasks, date) {
  return tasks.filter((t) => t.date === date && t.status !== 'done').reduce((s, t) => s + (t.planned_minutes || 0), 0);
}

export function overflow(tasks, date, capacity = 120) {
  return Math.max(0, dayLoad(tasks, date) - capacity);
}

export function suggestRelief(tasks, date, capacity, opts) {
  const over = overflow(tasks, date, capacity);
  if (!over) return null;
  const movable = tasks.filter((t) => t.date === date && t.status !== 'done' && t.kind !== 'review')
    .sort((a, b) => b.planned_minutes - a.planned_minutes);
  const pick = movable[0];
  return pick ? { overMinutes: over, move: pick.id, to: nextStudyDay(date, opts) } : { overMinutes: over, move: null, to: null };
}
