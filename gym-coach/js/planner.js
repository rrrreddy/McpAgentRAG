// 12-week periodized plan generator. Pure functions, no DOM — the same inputs always give the same plan,
// so the plan can be regenerated at any time from (profile, adjustments, exercise state).

import { BY_ID, optionsFor } from './exercises.js';

export const WEEKS = 12;
export const GOALS = {
  fat_loss: 'Lose fat',
  muscle: 'Build muscle',
  strength: 'Get stronger',
  recomp: 'Lose fat & build muscle',
  endurance: 'Endurance & conditioning',
  general: 'General fitness & health',
};

// Movements a beginner should earn first.
const ADVANCED_ONLY = new Set(['pullup', 'front_squat', 'pike_pushup', 'deficit_pushup']);

// ---- split templates: list of [pattern, variantIndex, tier override?]
const T = {
  fbA: { name: 'Full Body A', focus: 'Squat + push/pull', slots: [['squat', 0], ['hpush', 0], ['hpull', 0], ['ham', 0], ['delt_side', 0], ['core', 0], ['calves', 0]] },
  fbB: { name: 'Full Body B', focus: 'Hinge + overhead', slots: [['hinge', 0], ['vpush', 0], ['vpull', 0], ['lunge', 0], ['biceps', 0], ['triceps', 0], ['core', 1]] },
  fbC: { name: 'Full Body C', focus: 'Volume & single-leg', slots: [['squat', 1], ['hpush', 1], ['hpull', 1], ['glute', 0], ['delt_rear', 0], ['calves', 0], ['core', 2]] },
  upA: { name: 'Upper A', focus: 'Chest & back strength', slots: [['hpush', 0], ['hpull', 0], ['vpush', 0], ['vpull', 0], ['delt_side', 0], ['biceps', 0], ['triceps', 0]] },
  loA: { name: 'Lower A', focus: 'Squat focus', slots: [['squat', 0], ['hinge', 1], ['lunge', 0], ['quad', 0], ['calves', 0], ['core', 0]] },
  upB: { name: 'Upper B', focus: 'Shoulders & back volume', slots: [['vpush', 0], ['vpull', 1], ['hpush', 1], ['hpull', 1], ['delt_rear', 0], ['triceps', 1], ['biceps', 1]] },
  loB: { name: 'Lower B', focus: 'Hinge focus', slots: [['hinge', 0], ['squat', 1], ['ham', 0], ['glute', 0], ['calves', 0], ['core', 1]] },
  push: { name: 'Push', focus: 'Chest, shoulders, triceps', slots: [['hpush', 0], ['vpush', 0], ['hpush', 1], ['chest_iso', 0], ['delt_side', 0], ['triceps', 0], ['triceps', 1]] },
  pull: { name: 'Pull', focus: 'Back & biceps', slots: [['vpull', 0], ['hpull', 0], ['hpull', 1], ['delt_rear', 0], ['biceps', 0], ['biceps', 1], ['core', 0]] },
  legs: { name: 'Legs', focus: 'Quads, hamstrings, glutes', slots: [['squat', 0], ['hinge', 1], ['lunge', 0], ['quad', 0], ['ham', 0], ['calves', 0]] },
};

export function splitFor(days, experience) {
  switch (days) {
    case 2: return { name: 'Full Body ×2', days: [T.fbA, T.fbB] };
    case 3: return { name: 'Full Body ×3', days: [T.fbA, T.fbB, T.fbC] };
    case 4: return { name: 'Upper / Lower', days: [T.upA, T.loA, T.upB, T.loB] };
    case 5: return experience === 'beginner'
      ? { name: 'Upper / Lower + Full Body', days: [T.upA, T.loA, T.fbC, T.upB, T.loB] }
      : { name: 'Upper / Lower / Push / Pull / Legs', days: [T.upA, T.loA, T.push, T.pull, T.legs] };
    default: return { name: 'Push / Pull / Legs ×2', days: [T.push, T.pull, T.legs, { ...T.push, name: 'Push B' }, { ...T.pull, name: 'Pull B' }, { ...T.legs, name: 'Legs B' }] };
  }
}

// Rep ranges by goal → block → tier.
const REPS = {
  strength: [[[5, 6], [6, 8], [10, 12]], [[3, 5], [5, 7], [8, 12]], [[2, 4], [4, 6], [8, 10]]],
  muscle: [[[8, 10], [10, 12], [12, 15]], [[6, 8], [8, 10], [10, 12]], [[5, 7], [6, 10], [10, 15]]],
  recomp: [[[8, 10], [10, 12], [12, 15]], [[6, 8], [8, 10], [10, 12]], [[5, 7], [6, 10], [10, 15]]],
  fat_loss: [[[8, 10], [10, 12], [12, 15]], [[6, 8], [8, 12], [12, 15]], [[5, 8], [8, 10], [12, 15]]],
  endurance: [[[12, 15], [12, 15], [15, 20]], [[10, 12], [12, 15], [15, 20]], [[8, 10], [10, 15], [15, 20]]],
  general: [[[8, 10], [10, 12], [12, 15]], [[6, 8], [8, 12], [10, 15]], [[5, 8], [8, 10], [10, 15]]],
};
const BW_REPS = [[8, 12], [10, 15], [12, 20]]; // bodyweight: progress with reps, not load

const BLOCKS = [
  { name: 'Foundation', weeks: [1, 2, 3, 4], summary: 'Learn technique, build work capacity, find your working weights.' },
  { name: 'Build', weeks: [5, 6, 7, 8], summary: 'Heavier loads, more volume on key lifts — the main growth phase.' },
  { name: 'Peak', weeks: [9, 10, 11, 12], summary: 'Heaviest work, then deload and retest to measure 12-week progress.' },
];

export function blockOf(week) {
  return Math.min(2, Math.floor((week - 1) / 4));
}
export function isDeload(week, adjustments = {}) {
  return week % 4 === 0 || (adjustments.extraDeloads || []).includes(week);
}
/** Target reps-in-reserve: ramps 3 → 2 → 1 across a block, 4 on deloads. Beginners never go below 2. */
export function rirFor(week, experience, adjustments = {}) {
  if (isDeload(week, adjustments)) return 4;
  const inBlock = (week - 1) % 4; // 0..2
  const rir = 3 - inBlock;
  return experience === 'beginner' ? Math.max(2, rir) : rir;
}

export function exerciseCountFor(minutes) {
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 6;
  if (minutes <= 75) return 7;
  return 8;
}

// ---- load math (Epley)
export const e1rm = (w, reps) => w * (1 + reps / 30);
export const loadFor = (oneRm, reps, rir) => oneRm / (1 + (reps + rir) / 30);
export function roundTo(x, inc) {
  return Math.max(0, Math.round(x / inc) * inc);
}

/** Starting load estimate from the baseline lifts the user entered (weight × reps they can currently do). */
function baselineLoad(ex, profile, reps, rir) {
  if (!ex.base) return null;
  const [lift, ratio] = ex.base;
  const b = profile.lifts?.[lift];
  if (!b || !b.w || !b.r) return null;
  const est = e1rm(b.w, b.r) * ratio;
  return loadFor(est, reps, rir);
}

/**
 * Pick the exercise for a slot. Honors user swaps first, then the variant index, skipping duplicates within the day.
 */
function pickExercise(pattern, variant, profile, injuries, used, swaps, slotKey) {
  if (swaps[slotKey] && BY_ID[swaps[slotKey]]) return BY_ID[swaps[slotKey]];
  let opts = optionsFor(pattern, profile.equipment, injuries).filter((e) => !used.has(e.id));
  if (profile.experience === 'beginner') {
    const easy = opts.filter((e) => !ADVANCED_ONLY.has(e.id));
    if (easy.length) opts = easy;
  }
  if (!opts.length) return null;
  return opts[variant % opts.length];
}

function setsFor(tier, experience, block, deload, volumeDelta) {
  let s;
  if (tier === 1) s = experience === 'beginner' ? 3 : experience === 'advanced' && block >= 1 ? 5 : 4;
  else if (tier === 2) s = 3;
  else s = experience === 'beginner' ? 2 : 3;
  if (tier > 1) s += volumeDelta;
  if (deload) s = Math.ceil(s * 0.5);
  return Math.max(1, Math.min(6, s));
}

function restFor(tier, goal) {
  const heavy = goal === 'strength';
  if (tier === 1) return heavy ? 180 : 120;
  if (tier === 2) return heavy ? 120 : 90;
  return goal === 'fat_loss' || goal === 'endurance' ? 45 : 60;
}

/**
 * Build a single day's session for a given week.
 * exState: { [exerciseId]: { e1rm, reps, w, updated } } — learned from the user's logs.
 */
export function buildDay(profile, template, dayIndex, week, adjustments = {}, exState = {}) {
  const block = blockOf(week);
  const deload = isDeload(week, adjustments);
  const rir = rirFor(week, profile.experience, adjustments);
  const injuries = [...new Set([...(profile.injuries || []), ...(adjustments.extraInjuries || [])])];
  const volumeDelta = deload ? 0 : (adjustments.volumeByWeek?.[week] || 0) + (adjustments.volumeBase || 0);
  const swaps = adjustments.swaps || {};
  const maxEx = exerciseCountFor(profile.minutes);
  const used = new Set();
  const exercises = [];

  template.slots.forEach(([pattern, variant], slotIdx) => {
    if (exercises.length >= maxEx) return;
    const slotKey = `${template.name}:${slotIdx}`;
    const ex = pickExercise(pattern, variant, profile, injuries, used, swaps, slotKey);
    if (!ex) return;
    used.add(ex.id);
    // The first slot is the day's main lift; everything after it is secondary or accessory work.
    const tier = slotIdx === 0 ? 1 : Math.max(ex.tier, 2);
    const reps = ex.load === 'bw' ? BW_REPS[Math.min(2, tier - 1)] : REPS[profile.goal][block][tier - 1];
    const sets = setsFor(tier, profile.experience, block, deload, volumeDelta);

    let load = null;
    let loadSource = null;
    if (ex.load !== 'bw') {
      const st = exState[ex.id];
      const target = reps[0]; // aim to own the bottom of the range first, then earn reps
      if (st && st.e1rm) {
        load = loadFor(st.e1rm, target, rir);
        loadSource = 'your logs';
      } else {
        const b = baselineLoad(ex, profile, target, rir);
        if (b) { load = b; loadSource = 'your baseline lifts'; }
      }
      if (load != null) {
        if (deload) load *= 0.9;
        load = roundTo(load, ex.inc || 2.5);
      }
    }
    exercises.push({
      id: ex.id, slotKey, pattern, name: ex.name, cue: ex.cue, loadType: ex.load, tier,
      sets, reps, rir, rest: restFor(tier, profile.goal), load, loadSource,
      lastReps: exState[ex.id]?.lastReps || null,
    });
  });

  return {
    week, dayIndex, name: template.name, focus: template.focus, deload, rir, exercises,
    finisher: finisherFor(profile.goal, block, deload),
  };
}

function finisherFor(goal, block, deload) {
  if (deload) return 'Easy 10-min walk + mobility. No finisher on deload weeks.';
  if (goal === 'fat_loss' || goal === 'recomp') return ['8-min EMOM: 10 kettlebell/DB swings + 5 push-ups', '10-min bike/rower intervals: 30s hard / 60s easy', '12-min incline walk at a brisk pace'][block];
  if (goal === 'endurance') return ['10-min circuit: squats, push-ups, rows — 40s on / 20s off', '12-min rower or bike: 1 min hard / 1 min easy', '15-min tempo run/bike at a comfortably hard pace'][block];
  return '5–10 min easy cardio cool-down + stretch the muscles you trained.';
}

export function cardioPlan(profile, week) {
  const block = blockOf(week);
  const deload = week % 4 === 0;
  const g = profile.goal;
  const steps = g === 'fat_loss' ? [8000, 9000, 10000][block] : g === 'recomp' ? 8000 : 7000;
  let sessions;
  if (g === 'fat_loss') sessions = [`3 × 25 min zone-2 (easy talk-pace)`, `3 × 30 min zone-2`, `2 × 30 min zone-2 + 1 × 15 min intervals`][block];
  else if (g === 'endurance') sessions = [`3 × 25 min zone-2`, `3 × 35 min zone-2 + 1 × intervals`, `2 × 45 min zone-2 + 1 × 20 min tempo`][block];
  else if (g === 'strength') sessions = `2 × 20 min easy cardio (keeps recovery high)`;
  else sessions = [`2 × 20 min zone-2`, `2 × 25 min zone-2`, `2 × 30 min zone-2`][block];
  return { steps: deload ? Math.round(steps * 0.85) : steps, sessions: deload ? 'Easy walks only — let your body recover' : sessions };
}

// ---- nutrition
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };

export function nutritionFor(profile, adjustments = {}, currentWeightKg) {
  const w = currentWeightKg || profile.weightKg;
  const h = profile.heightCm;
  const a = profile.age;
  const sexAdj = profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * a + sexAdj;
  const tdee = bmr * (ACTIVITY[profile.activity] || 1.55);
  const goalFactor = {
    fat_loss: 0.8,
    muscle: profile.experience === 'advanced' ? 1.05 : 1.1,
    strength: 1.05,
    recomp: 0.95,
    endurance: 1.0,
    general: 1.0,
  }[profile.goal];
  const floor = profile.sex === 'male' ? 1500 : 1200;
  const calories = Math.round(Math.max(floor, tdee * goalFactor + (adjustments.calorieDelta || 0)) / 10) * 10;

  const bmi = w / (h / 100) ** 2;
  const proteinBasis = bmi > 30 ? 27 * (h / 100) ** 2 : w; // don't over-prescribe protein at high body fat
  const proteinPerKg = profile.goal === 'fat_loss' || profile.goal === 'recomp' ? 2.2 : 1.8;
  const protein = Math.round(proteinBasis * proteinPerKg);
  const fat = Math.round(Math.max((calories * 0.22) / 9, proteinBasis * 0.7));
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee), calories, protein, fat, carbs,
    waterL: Math.round(w * 0.035 * 10) / 10,
    fiberG: Math.round((calories / 1000) * 14),
  };
}

/** Rough 12-week expectation so the user knows what "on track" looks like. */
export function projection(profile) {
  const w = profile.weightKg;
  const rate = {
    fat_loss: [-0.005, -0.0075], muscle: profile.experience === 'beginner' ? [0.0025, 0.005] : [0.001, 0.0025],
    strength: [0, 0.0025], recomp: [-0.0025, 0], endurance: [-0.0025, 0], general: [-0.0025, 0.001],
  }[profile.goal];
  const lo = w * (1 + rate[0]) ** WEEKS;
  const hi = w * (1 + rate[1]) ** WEEKS;
  const strengthGain = { beginner: [15, 30], intermediate: [5, 12], advanced: [2, 6] }[profile.experience];
  return {
    weightRange: [Math.round(Math.min(lo, hi) * 10) / 10, Math.round(Math.max(lo, hi) * 10) / 10],
    weeklyRatePct: rate.map((r) => Math.round(r * 1000) / 10),
    strengthGainPct: strengthGain,
  };
}

/** Full 12-week plan. */
export function generatePlan(profile, adjustments = {}, exState = {}) {
  const split = splitFor(profile.days, profile.experience);
  const weeks = [];
  for (let wk = 1; wk <= WEEKS; wk++) {
    const block = blockOf(wk);
    weeks.push({
      week: wk,
      block,
      blockName: BLOCKS[block].name,
      deload: isDeload(wk, adjustments),
      rir: rirFor(wk, profile.experience, adjustments),
      days: split.days.map((tpl, i) => buildDay(profile, tpl, i, wk, adjustments, exState)),
      cardio: cardioPlan(profile, wk),
    });
  }
  return {
    split: split.name,
    blocks: BLOCKS,
    weeks,
    nutrition: nutritionFor(profile, adjustments, adjustments.currentWeightKg),
    projection: projection(profile),
    rationale: rationaleFor(profile, split),
  };
}

function rationaleFor(p, split) {
  const out = [];
  out.push(`${split.name}: with ${p.days} training days this hits every muscle about twice a week, which is the best-supported frequency for growth and strength.`);
  out.push('12 weeks = 3 blocks of 4 weeks. Effort ramps week to week (3 → 2 → 1 reps left in the tank) and every 4th week is a deload so you recover and keep progressing.');
  if (p.goal === 'fat_loss') out.push('Lifting stays heavy so you keep muscle while in a calorie deficit; cardio and steps create most of the extra burn.');
  if (p.goal === 'muscle') out.push('A small calorie surplus plus progressive volume. Aim to gain slowly so most of it is muscle.');
  if (p.goal === 'strength') out.push('Main lifts move from 5-6 reps down to 2-4 reps across the blocks; accessories build the muscle that supports them.');
  if (p.goal === 'recomp') out.push('Near-maintenance calories with high protein — works best for beginners and people returning to training.');
  if (p.goal === 'endurance') out.push('Higher reps and short rests build muscular endurance; cardio progresses from easy volume to tempo work.');
  if (p.experience === 'beginner') out.push('As a beginner you never train closer than 2 reps from failure — technique first, and the weights will still go up almost every session.');
  if ((p.injuries || []).length) out.push(`Exercises that commonly aggravate your ${p.injuries.join(', ').replace('_', ' ')} are left out. Stop any movement that causes sharp pain and see a professional.`);
  if (p.currentDays && p.currentDays > 0 && p.days > p.currentDays + 1) out.push(`You currently train ${p.currentDays}×/week; jumping to ${p.days}× is a big step — sets start conservative and grow if recovery is good.`);
  return out;
}

/** Which week of the plan are we in today (1-based, clamped to the plan). */
export function currentWeek(startDate, today = new Date()) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const days = Math.floor((t - start) / 86400000);
  return Math.min(WEEKS, Math.max(1, Math.floor(days / 7) + 1));
}
