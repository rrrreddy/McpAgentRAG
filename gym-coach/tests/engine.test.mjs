// Run: node --test gym-coach/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { BY_ID, EXERCISES, optionsFor } from '../js/exercises.js';
import { WEEKS, buildDay, currentWeek, generatePlan, isDeload, nutritionFor, rirFor, splitFor } from '../js/planner.js';
import { applyCheckIn, applyWorkout, defaultAdjustments } from '../js/progress.js';
import { parseAdjust } from '../js/ai.js';

const base = {
  name: 'T', units: 'kg', sex: 'male', age: 30, heightCm: 180, weightKg: 85, goal: 'muscle', experience: 'intermediate',
  days: 4, minutes: 60, equipment: 'gym', activity: 'light', currentDays: 3, currentRoutine: '', injuries: [],
  lifts: { squat: { w: 100, r: 5 }, bench: { w: 80, r: 5 } },
};

test('exercise ids are unique and every pattern has a bodyweight option', () => {
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  for (const pat of new Set(EXERCISES.map((e) => e.pattern))) {
    assert.ok(optionsFor(pat, 'bw', []).length > 0, `no bodyweight option for ${pat}`);
  }
});

test('plan has 12 weeks with deloads on 4, 8, 12 and the right number of days', () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const pl = generatePlan({ ...base, days });
    assert.equal(pl.weeks.length, WEEKS);
    assert.equal(pl.weeks[0].days.length, days);
    assert.deepEqual(pl.weeks.filter((w) => w.deload).map((w) => w.week), [4, 8, 12]);
  }
  assert.equal(splitFor(4).name, 'Upper / Lower');
});

test('every goal × equipment × experience produces non-empty sessions within the time budget', () => {
  for (const goal of ['fat_loss', 'muscle', 'strength', 'recomp', 'endurance', 'general']) {
    for (const equipment of ['gym', 'db', 'bw']) {
      for (const experience of ['beginner', 'intermediate', 'advanced']) {
        for (const minutes of [30, 90]) {
          const pl = generatePlan({ ...base, goal, equipment, experience, minutes, injuries: ['knee', 'lower_back', 'shoulder'] });
          for (const w of pl.weeks) for (const d of w.days) {
            assert.ok(d.exercises.length >= 3, `${goal}/${equipment}/${experience} ${d.name} too short`);
            assert.ok(d.exercises.length <= (minutes === 30 ? 4 : 8));
            for (const e of d.exercises) {
              assert.ok(e.reps[0] <= e.reps[1] && e.sets >= 1);
              assert.ok(!BY_ID[e.id].avoid.some((a) => ['knee', 'lower_back', 'shoulder'].includes(a)), `${e.id} ignores injuries`);
            }
          }
          assert.ok(pl.nutrition.calories >= 1500);
        }
      }
    }
  }
});

test('effort ramps within a block; beginners stay at 2+ RIR', () => {
  assert.deepEqual([1, 2, 3, 4].map((w) => rirFor(w, 'intermediate')), [3, 2, 1, 4]);
  assert.deepEqual([1, 2, 3, 4].map((w) => rirFor(w, 'beginner')), [3, 2, 2, 4]);
  assert.ok(isDeload(6, { extraDeloads: [6] }));
});

test('starting loads come from baseline lifts and rise across the block', () => {
  const pl = generatePlan(base);
  const bench = (wk) => pl.weeks[wk - 1].days[0].exercises.find((e) => e.id === 'bench');
  assert.ok(bench(1).load > 50 && bench(1).load < 80, `week1 bench ${bench(1).load}`);
  assert.ok(bench(3).load > bench(1).load);
  assert.ok(bench(4).load < bench(3).load, 'deload is lighter');
  assert.ok(bench(4).sets < bench(3).sets, 'deload has fewer sets');
});

test('nutrition: deficit for fat loss, surplus for muscle', () => {
  const fl = nutritionFor({ ...base, goal: 'fat_loss' });
  const mu = nutritionFor({ ...base, goal: 'muscle' });
  assert.ok(fl.calories < fl.tdee && mu.calories > mu.tdee);
  assert.ok(Math.abs(fl.protein * 4 + fl.carbs * 4 + fl.fat * 9 - fl.calories) < 20);
});

test('logging all sets at the top of the range raises the next load; misses lower it after two sessions', () => {
  const state = { profile: base, exState: {}, adjustments: defaultAdjustments() };
  const day1 = buildDay(base, splitFor(4).days[0], 0, 1, {}, {});
  const rx = day1.exercises[0];
  const top = { id: rx.id, sets: Array.from({ length: rx.sets }, () => ({ w: rx.load, r: rx.reps[1] })) };
  const r1 = applyWorkout(state, day1, [top]);
  const next = buildDay(base, splitFor(4).days[0], 0, 1, {}, r1.exState).exercises[0];
  assert.ok(next.load > rx.load, `expected increase from ${rx.load}, got ${next.load}`);

  let st = { ...state, exState: r1.exState };
  const miss = { id: rx.id, sets: Array.from({ length: rx.sets }, () => ({ w: next.load, r: 1 })) };
  for (let i = 0; i < 2; i++) st = { ...st, exState: applyWorkout(st, day1, [miss]).exState };
  assert.ok(st.exState[rx.id].e1rm < r1.exState[rx.id].e1rm);
});

test('weekly check-in adapts calories, volume, deloads and injuries', () => {
  const s = { profile: { ...base, goal: 'fat_loss' }, startDate: '2026-01-05', adjustments: defaultAdjustments(), checkIns: [], logs: [] };
  const stalled = applyCheckIn(s, { date: '2026-01-12', week: 1, weightKg: 85, sleep: 4, energy: 4, soreness: 2, pain: [] });
  assert.equal(stalled.adjustments.calorieDelta, -150);

  const tired1 = applyCheckIn(s, { date: '2026-01-12', week: 1, weightKg: 84.4, sleep: 2, energy: 2, soreness: 4, pain: ['knee'] });
  assert.equal(tired1.adjustments.volumeByWeek[2], -1);
  assert.deepEqual(tired1.adjustments.extraInjuries, ['knee']);
  const pl = generatePlan(s.profile, tired1.adjustments);
  for (const d of pl.weeks[1].days) for (const e of d.exercises) assert.ok(!BY_ID[e.id].avoid.includes('knee'));

  const s2 = { ...s, adjustments: tired1.adjustments, checkIns: [tired1.checkIn] };
  const tired2 = applyCheckIn(s2, { date: '2026-01-19', week: 2, weightKg: 84, sleep: 1, energy: 2, soreness: 5, pain: [] });
  assert.ok(tired2.adjustments.extraDeloads.includes(3));
});

test('currentWeek is clamped to the plan', () => {
  assert.equal(currentWeek('2026-01-05', new Date('2026-01-05T12:00')), 1);
  assert.equal(currentWeek('2026-01-05', new Date('2026-01-13T12:00')), 2);
  assert.equal(currentWeek('2026-01-05', new Date('2027-01-01T12:00')), 12);
});

test('AI ADJUST line is parsed and clamped', () => {
  assert.deepEqual(parseAdjust('text\nADJUST {"calorieDelta": -900, "volumeDelta": 1}'), { calorieDelta: -300, volumeDelta: 1 });
  assert.equal(parseAdjust('no change'), null);
  assert.equal(parseAdjust('ADJUST {bad json}'), null);
});

test('weigh-ins less than 5 days apart do not change calories', () => {
  const s = { profile: { ...base, goal: 'fat_loss' }, startDate: '2026-01-05', adjustments: defaultAdjustments(), checkIns: [], logs: [] };
  const r = applyCheckIn(s, { date: '2026-01-05', week: 1, weightKg: 83, sleep: 3, energy: 3, soreness: 3, pain: [] });
  assert.equal(r.adjustments.calorieDelta, 0);
  assert.equal(r.adjustments.currentWeightKg, 83);
});

test('gym log records, PR detection and streaks', async () => {
  const { records, detectPRs, streakWeeks } = await import('../js/progress.js');
  const logs = [
    { date: '2026-01-05', week: 1, entries: [{ id: 'bench', sets: [{ w: 60, r: 8 }, { w: 60, r: 7 }] }, { id: 'pushup', sets: [{ w: 0, r: 12 }] }] },
    { date: '2026-01-12', week: 2, entries: [{ id: 'bench', sets: [{ w: 62.5, r: 8 }] }] },
  ];
  const rec = records(logs);
  assert.equal(rec.bench.heaviest.w, 62.5);
  assert.equal(rec.bench.sessions, 2);
  assert.equal(rec.pushup.mostReps.r, 12);
  assert.deepEqual(detectPRs(logs, [{ id: 'bench', sets: [{ w: 65, r: 8 }] }]).map((p) => p.kind), ['strength']);
  assert.equal(detectPRs(logs, [{ id: 'bench', sets: [{ w: 50, r: 5 }] }]).length, 0);
  assert.equal(detectPRs(logs, [{ id: 'pushup', sets: [{ w: 0, r: 15 }] }])[0].kind, 'reps');
  assert.equal(detectPRs(logs, [{ id: 'rdl', sets: [{ w: 80, r: 8 }] }]).length, 0, 'first time is not a PR');
  assert.equal(streakWeeks(logs, '2026-01-14'), 2);
  assert.equal(streakWeeks(logs, '2026-02-20'), 0);
});

test('plan uses inputs: bodyweight-based loads, on-ramp, fitness notes, target-weight calories', () => {
  const noLifts = { ...base, lifts: {} };
  const pl = generatePlan(noLifts);
  const bench = pl.weeks[0].days[0].exercises[0];
  assert.ok(bench.load > 20 && bench.load < 80, `estimated bench ${bench.load}`);
  assert.match(bench.loadSource, /bodyweight/);

  const fresh = generatePlan({ ...base, currentDays: 0 });
  const trained = generatePlan({ ...base, currentDays: 4 });
  assert.equal(fresh.weeks[0].days[0].exercises[0].rir, trained.weeks[0].days[0].exercises[0].rir + 1);

  const bw = generatePlan({ ...base, equipment: 'bw', pushups: 3 });
  const push = bw.weeks[0].days.flatMap((d) => d.exercises).find((e) => e.id === 'pushup');
  assert.match(push.note, /bench or wall/);

  const aggressive = nutritionFor({ ...base, goal: 'fat_loss', targetWeightKg: 60 });
  assert.ok(aggressive.calories >= Math.round(aggressive.tdee * 0.75) - 10, 'deficit capped at 25%');
  const gentle = nutritionFor({ ...base, goal: 'fat_loss', targetWeightKg: 84 });
  assert.ok(gentle.calories > aggressive.calories);
  assert.ok(pl.inputs.length >= 5);
});
