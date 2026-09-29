// Adaptive coaching engine: turns workout logs and weekly check-ins into plan adjustments.
// Pure functions over plain objects so they are testable without a browser.

import { BY_ID } from './exercises.js';
import { e1rm, isDeload, WEEKS } from './planner.js';

export function defaultAdjustments() {
  return {
    calorieDelta: 0,
    volumeBase: 0, // +/- sets on secondary & accessory work for the rest of the plan
    volumeByWeek: {}, // one-off +/- sets for a specific week
    extraDeloads: [],
    extraInjuries: [],
    swaps: {},
    currentWeightKg: null,
  };
}

/** Best estimated 1RM from a list of sets, assuming the planned reps-in-reserve. */
export function sessionE1rm(sets, rir = 2) {
  let best = 0;
  for (const s of sets) {
    const w = Number(s.w);
    const r = Number(s.r);
    if (w > 0 && r > 0) best = Math.max(best, e1rm(w, r + rir));
  }
  return best;
}

/**
 * Record a finished workout. Updates exState (the learned strength per exercise) and returns
 * human-readable coach notes. `day` is the prescribed day from buildDay() so we know targets.
 */
export function applyWorkout(state, day, entries) {
  const notes = [];
  const exState = { ...state.exState };
  for (const entry of entries) {
    const rx = day.exercises.find((e) => e.id === entry.id);
    const ex = BY_ID[entry.id];
    if (!rx || !ex) continue;
    const done = entry.sets.filter((s) => Number(s.r) > 0);
    if (!done.length) continue;
    const prev = exState[entry.id] || {};
    const reps = done.map((s) => Number(s.r));
    const [lo, hi] = rx.reps;
    const next = { ...prev, lastReps: reps, updated: new Date().toISOString() };

    if (ex.load === 'bw') {
      if (reps.every((r) => r >= hi)) notes.push(`${ex.name}: all sets at ${hi}+ reps — make it harder next time (slower tempo, harder variation or add a backpack).`);
      else if (reps.some((r) => r < lo)) notes.push(`${ex.name}: below ${lo} reps — use an easier variation so you stay in the ${lo}-${hi} range.`);
    } else if (!day.deload) {
      const est = sessionE1rm(done, rx.rir);
      if (est > 0) {
        let val = est;
        if (prev.e1rm) {
          // Smooth: cap jumps at +6% per session and drops at -8%, so one great/bad day doesn't whipsaw loads.
          val = Math.min(val, prev.e1rm * 1.06);
          val = Math.max(val, prev.e1rm * 0.92);
        }
        next.e1rm = Math.round(val * 10) / 10;
        next.history = [...(prev.history || []), { date: new Date().toISOString().slice(0, 10), e1rm: next.e1rm }].slice(-60);
        if (reps.every((r) => r >= hi)) notes.push(`${ex.name}: crushed it — load goes up next session.`);
        else if (reps.filter((r) => r < lo).length >= Math.ceil(reps.length / 2)) {
          next.misses = (prev.misses || 0) + 1;
          notes.push(next.misses >= 2
            ? `${ex.name}: missed reps twice in a row — load drops ~8% so you can rebuild with good form.`
            : `${ex.name}: tough day — load holds. Sleep, food and stress all count.`);
          if (next.misses >= 2) { next.e1rm = Math.round(prev.e1rm * 0.92 * 10) / 10; next.misses = 0; }
        } else next.misses = 0;
      }
    }
    exState[entry.id] = next;
  }
  return { exState, notes };
}

export function sessionsInWeek(logs, week) {
  return logs.filter((l) => l.week === week && l.dayIndex >= 0).length; // extra/free logs don't count as planned sessions
}

export function adherence(state, week) {
  return Math.min(1, sessionsInWeek(state.logs || [], week) / state.profile.days);
}

/** Recovery score on a 1-5 scale from sleep, energy and soreness (higher is better). */
export function recoveryScore(ci) {
  return (Number(ci.sleep) + Number(ci.energy) + (6 - Number(ci.soreness))) / 3;
}

/**
 * Weekly check-in → automatic adjustments. Returns the new adjustments and the reasons.
 * Rules follow common evidence-based coaching practice:
 *  - bodyweight trend vs. goal rate → calories ±100-150/day
 *  - poor recovery → cut volume next week, or insert an extra deload if it persists
 *  - great recovery + great adherence → add a set to accessories
 *  - reported pain → swap out exercises that load that area
 */
export function applyCheckIn(state, ci) {
  const adj = structuredClone(state.adjustments || defaultAdjustments());
  const msgs = [];
  const p = state.profile;
  const prevCheckIns = state.checkIns || [];
  const week = ci.week;
  const nextWeek = Math.min(WEEKS, week + 1);

  // ---- bodyweight trend
  if (ci.weightKg) {
    const last = prevCheckIns.filter((c) => c.weightKg).at(-1);
    const prevW = last ? last.weightKg : p.weightKg;
    const prevDate = last ? new Date(last.date) : new Date(state.startDate);
    const days = (new Date(ci.date) - prevDate) / 86400000;
    const pct = ((ci.weightKg - prevW) / prevW / Math.max(1, days / 7)) * 100;
    adj.currentWeightKg = ci.weightKg;
    const g = p.goal;
    let delta = 0;
    // Day-to-day water swings are ±1-2%, so a trend needs at least ~5 days between weigh-ins.
    if (days < 5) {
      msgs.push('Weight logged. Calories are only adjusted once there are at least 5 days between weigh-ins.');
    } else {
      ci.weeklyChangePct = Math.round(pct * 100) / 100;
      if (g === 'fat_loss') {
        if (pct > -0.25) { delta = -150; msgs.push(`Weight change ${fmtPct(pct)}/wk is slower than the 0.5-1% target — calories down 150/day.`); }
        else if (pct < -1.2) { delta = 150; msgs.push(`Losing ${fmtPct(pct)}/wk is too fast (muscle loss risk) — calories up 150/day.`); }
        else msgs.push(`Weight change ${fmtPct(pct)}/wk — right on target. Calories unchanged.`);
      } else if (g === 'muscle') {
        if (pct < 0.1) { delta = 150; msgs.push(`Weight change ${fmtPct(pct)}/wk — not gaining yet. Calories up 150/day.`); }
        else if (pct > 0.6) { delta = -100; msgs.push(`Gaining ${fmtPct(pct)}/wk is faster than needed (extra will be fat) — calories down 100/day.`); }
        else msgs.push(`Gaining ${fmtPct(pct)}/wk — ideal lean-gain pace.`);
      } else if (g === 'recomp') {
        if (pct < -0.6) { delta = 100; msgs.push(`Dropping ${fmtPct(pct)}/wk — a bit fast for recomp, calories up 100/day.`); }
        else if (pct > 0.3) { delta = -100; msgs.push(`Up ${fmtPct(pct)}/wk — calories down 100/day to stay near maintenance.`); }
        else msgs.push(`Weight stable (${fmtPct(pct)}/wk) — perfect for recomposition.`);
      } else if (Math.abs(pct) > 0.5) {
        delta = pct > 0 ? -100 : 100;
        msgs.push(`Weight moved ${fmtPct(pct)}/wk — calories ${delta > 0 ? 'up' : 'down'} 100/day to hold steady.`);
      }
    }
    adj.calorieDelta = clamp((adj.calorieDelta || 0) + delta, -600, 600);
  }

  // ---- recovery & adherence → volume
  const score = recoveryScore(ci);
  ci.recovery = Math.round(score * 10) / 10;
  const adh = ci.adherence ?? adherence(state, week);
  ci.adherence = adh;
  const prevScore = prevCheckIns.length ? prevCheckIns.at(-1).recovery : null;
  const nextIsDeload = isDeload(nextWeek, adj);

  if (score <= 2.3 && prevScore != null && prevScore <= 2.7 && !nextIsDeload && week < WEEKS) {
    adj.extraDeloads = [...new Set([...(adj.extraDeloads || []), nextWeek])];
    msgs.push(`Recovery has been low two weeks running (${score.toFixed(1)}/5) — week ${nextWeek} becomes a deload. Recovering now beats grinding into an injury.`);
  } else if (score <= 2.7 && !nextIsDeload) {
    adj.volumeByWeek = { ...adj.volumeByWeek, [nextWeek]: -1 };
    msgs.push(`Recovery is low (${score.toFixed(1)}/5) — one fewer set on accessories in week ${nextWeek}. Prioritise sleep.`);
  } else if (score >= 4 && adh >= 0.9 && p.experience !== 'beginner' && (adj.volumeBase || 0) < 2) {
    adj.volumeBase = (adj.volumeBase || 0) + 1;
    msgs.push(`Recovery ${score.toFixed(1)}/5 and ${Math.round(adh * 100)}% adherence — adding a set to accessory work from now on.`);
  } else {
    msgs.push(`Recovery ${score.toFixed(1)}/5 — training volume stays as planned.`);
  }

  const weekOver = new Date(ci.date) >= new Date(new Date(state.startDate).getTime() + (week * 7 - 1) * 86400000);
  if (adh < 0.6 && weekOver) {
    msgs.push(`You completed ${Math.round(adh * 100)}% of planned sessions. If ${p.days} days/week is hard to fit in, lower the days in Settings — a plan you can follow beats a perfect one you can't.`);
  }

  // ---- pain → avoid aggravating exercises
  const pain = (ci.pain || []).filter(Boolean);
  if (pain.length) {
    adj.extraInjuries = [...new Set([...(adj.extraInjuries || []), ...pain])];
    msgs.push(`You reported ${pain.join(', ').replaceAll('_', ' ')} discomfort — exercises that load it are swapped out. If pain is sharp or lasts, see a physio/doctor.`);
  } else if ((adj.extraInjuries || []).length && score >= 3) {
    msgs.push(`No pain reported — previously swapped exercises come back.`);
    adj.extraInjuries = [];
  }

  return { adjustments: adj, messages: msgs, checkIn: ci };
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function fmtPct(p) { return `${p > 0 ? '+' : ''}${p.toFixed(2)}%`; }

// ---- Gym log records

/** Personal records per exercise from all logs. Loads in kg. */
export function records(logs) {
  const out = {};
  for (const l of logs) {
    for (const e of l.entries) {
      const r = (out[e.id] ||= { sessions: 0, lastDate: null, best: null, heaviest: null, mostReps: null, volume: 0 });
      r.sessions++;
      r.lastDate = !r.lastDate || l.date > r.lastDate ? l.date : r.lastDate;
      for (const s of e.sets) {
        const w = Number(s.w) || 0;
        const reps = Number(s.r) || 0;
        if (!reps) continue;
        r.volume += w * reps;
        if (w > 0) {
          const est = e1rm(w, reps);
          if (!r.best || est > r.best.e1rm) r.best = { e1rm: est, w, r: reps, date: l.date };
          if (!r.heaviest || w > r.heaviest.w || (w === r.heaviest.w && reps > r.heaviest.r)) r.heaviest = { w, r: reps, date: l.date };
        }
        if (!r.mostReps || reps > r.mostReps.r) r.mostReps = { w, r: reps, date: l.date };
      }
    }
  }
  return out;
}

/** PRs set by `entries` compared with earlier `logs`. Returns [{id, kind, w, r}]. */
export function detectPRs(logs, entries) {
  const before = records(logs);
  const prs = [];
  for (const e of entries) {
    const prev = before[e.id];
    if (!prev) continue; // first time doing it is a baseline, not a PR
    let bestSet = null;
    for (const s of e.sets) {
      const w = Number(s.w) || 0;
      const reps = Number(s.r) || 0;
      if (!reps) continue;
      if (w > 0 && prev.best && e1rm(w, reps) > prev.best.e1rm + 0.01 && (!bestSet || e1rm(w, reps) > e1rm(bestSet.w, bestSet.r))) bestSet = { w, r: reps };
    }
    if (bestSet) prs.push({ id: e.id, kind: 'strength', ...bestSet });
    else if (!e.sets.some((s) => Number(s.w) > 0) && prev.mostReps) {
      const top = Math.max(...e.sets.map((s) => Number(s.r) || 0));
      if (top > prev.mostReps.r) prs.push({ id: e.id, kind: 'reps', w: 0, r: top });
    }
  }
  return prs;
}

/** Monday-based ISO date of the week containing `date`. */
export function weekStart(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Consecutive calendar weeks (ending this or last week) with at least one workout. */
export function streakWeeks(logs, today = new Date().toISOString().slice(0, 10)) {
  const weeks = new Set(logs.map((l) => weekStart(l.date)));
  let cur = weekStart(today);
  if (!weeks.has(cur)) { const d = new Date(`${cur}T12:00:00`); d.setDate(d.getDate() - 7); cur = d.toISOString().slice(0, 10); }
  let n = 0;
  while (weeks.has(cur)) { n++; const d = new Date(`${cur}T12:00:00`); d.setDate(d.getDate() - 7); cur = d.toISOString().slice(0, 10); }
  return n;
}
