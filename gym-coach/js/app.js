import { BY_ID, EXERCISES, GUIDE_TOPICS, PATTERN_GUIDE, PATTERN_LABEL, swapOptions, videoUrl } from './exercises.js';
import { demoSvg, startDemos } from './animations.js';
import { GOALS, WEEKS, currentWeek, generatePlan } from './planner.js';
import { adherence, applyCheckIn, applyWorkout, defaultAdjustments, detectPRs, records, recoveryScore, streakWeeks, weekStart } from './progress.js';
import { LOCAL_MODELS, QUICK_PROMPTS, buildContext, chat, deleteLocalModel, isModelCached, loadLocalModel, parseAdjust, systemPrompt, webgpuAvailable } from './ai.js';
import { emptyState, exportJson, importJson, loadState, saveState } from './store.js';

let state = loadState();
const ui = {
  tab: 'today', wizard: null, step: 0, day: null, week: null, planWeek: null,
  timer: null, timerIv: null, ci: null, chartEx: null, aiBusy: false, aiStatus: '', abort: null,
  logView: 'history', guideQ: '', guidePat: '', free: null, prevTab: 'today',
};

const $view = document.getElementById('view');
const $top = document.getElementById('topbar');
const $tabs = document.getElementById('tabs');

// ---------- helpers
const LB = 2.20462;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const units = () => state.profile?.units || ui.wizard?.units || 'kg';
function showW(kg) {
  if (kg == null || kg === '') return '';
  if (units() === 'lb') return String(Math.round((kg * LB) / 2.5) * 2.5);
  return String(Math.round(kg * 2) / 2);
}
function toKg(v, u = units()) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return u === 'lb' ? n / LB : n;
}
const todayIso = () => new Date().toISOString().slice(0, 10);
function persist() {
  if (!saveState(state)) toast('Could not save — phone storage is full. Export a backup in Settings.');
}
function toast(msg, ms = 3500) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function addEvent(text, kind = 'info') {
  state.events.push({ date: todayIso(), text, kind });
  state.events = state.events.slice(-80);
}
const fmtW = (kg) => `${showW(kg)} ${units()}`;
function plan() {
  return generatePlan(state.profile, state.adjustments, state.exState, fmtW);
}
function planDaysElapsed() {
  return Math.floor((new Date(todayIso()) - new Date(state.startDate)) / 86400000);
}

// ---------- rendering root
function render() {
  if (!state.profile || ui.wizard) {
    $tabs.classList.add('hidden');
    renderWizard();
    return;
  }
  $tabs.classList.remove('hidden');
  for (const b of $tabs.querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
  ({ today: renderToday, plan: renderPlan, log: renderLog, guide: renderGuide, coach: renderCoach, settings: renderSettings })[ui.tab]();
  bindCharts();
  startDemos($view);
}

const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
function setTop(title, sub = '', right = null) {
  if (right === null) {
    right = ui.tab === 'settings'
      ? '<button class="linkbtn" data-action="close-settings">Done</button>'
      : `<button class="iconbtn" data-action="open-settings" aria-label="Settings">${GEAR}</button>`;
  }
  $top.innerHTML = `<div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${right}`;
}

// ---------- onboarding wizard
const WIZ_STEPS = ['You', 'Goal', 'Schedule', 'Now', 'Review'];
function newDraft() {
  return {
    name: '', units: 'kg', sex: 'male', age: '', height: '', heightFt: '', heightIn: '', weight: '', targetWeight: '',
    goal: 'muscle', experience: 'beginner', days: 3, minutes: 60, equipment: 'gym', activity: 'light',
    currentDays: 0, currentRoutine: '', injuries: [], pushups: '', pullups: '', plankSec: '', sleepHours: 7, cardioMin: 0,
    lifts: { squat: { w: '', r: '' }, bench: { w: '', r: '' }, deadlift: { w: '', r: '' }, ohp: { w: '', r: '' }, row: { w: '', r: '' } },
    restart: false,
  };
}
function draftFromProfile(p) {
  const u = p.units;
  const d = newDraft();
  const w = (kg) => (kg ? (u === 'lb' ? Math.round(kg * LB) : Math.round(kg * 10) / 10) : '');
  const inches = p.heightCm / 2.54;
  Object.assign(d, {
    ...p, weight: w(p.weightKg), targetWeight: w(p.targetWeightKg), height: p.heightCm,
    heightFt: Math.floor(inches / 12), heightIn: Math.round(inches % 12), injuries: [...(p.injuries || [])],
    pushups: p.pushups ?? '', pullups: p.pullups ?? '', plankSec: p.plankSec ?? '', sleepHours: p.sleepHours ?? 7, cardioMin: p.cardioMin ?? 0,
    lifts: Object.fromEntries(Object.entries(d.lifts).map(([k]) => [k, { w: w(p.lifts?.[k]?.w), r: p.lifts?.[k]?.r || '' }])),
  });
  return d;
}

function seg(bind, options, value) {
  return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-set="${bind}" data-val="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`;
}
function choice(bind, v, title, desc, value) {
  return `<button type="button" class="choice" data-set="${bind}" data-val="${v}" aria-pressed="${v === value}"><strong>${esc(title)}</strong><span>${esc(desc)}</span></button>`;
}

function renderWizard() {
  if (!ui.wizard) ui.wizard = newDraft();
  const d = ui.wizard;
  const editing = !!state.profile;
  setTop(editing ? 'Edit profile' : 'GymCoach AI', `Step ${ui.step + 1} of ${WIZ_STEPS.length} · ${WIZ_STEPS[ui.step]}`,
    editing ? '<button class="linkbtn" data-action="wiz-cancel">Cancel</button>' : '');
  const U = d.units;
  let body = '';
  if (ui.step === 0) {
    body = `
      <div class="card stack">
        <h2>${editing ? 'About you' : 'Let’s build your 12-week plan'}</h2>
        <p class="muted small" style="margin:0">Everything stays on your phone. Takes about 2 minutes.</p>
        <label class="field">Name (optional)<input data-bind="name" value="${esc(d.name)}" autocomplete="given-name"></label>
        <div><label class="field">Units</label>${seg('units', [['kg', 'kg / cm'], ['lb', 'lb / ft']], U)}</div>
        <div><label class="field">Sex (for calorie maths)</label>${seg('sex', [['male', 'Male'], ['female', 'Female'], ['other', 'Prefer not to say']], d.sex)}</div>
        <div class="grid2">
          <label class="field">Age<input data-bind="age" type="number" inputmode="numeric" min="13" max="90" value="${esc(d.age)}"></label>
          <label class="field">Weight (${U})<input data-bind="weight" type="number" inputmode="decimal" value="${esc(d.weight)}"></label>
        </div>
        ${U === 'kg'
          ? `<label class="field">Height (cm)<input data-bind="height" type="number" inputmode="decimal" value="${esc(d.height)}"></label>`
          : `<div class="grid2"><label class="field">Height (ft)<input data-bind="heightFt" type="number" inputmode="numeric" value="${esc(d.heightFt)}"></label><label class="field">(in)<input data-bind="heightIn" type="number" inputmode="numeric" value="${esc(d.heightIn)}"></label></div>`}
      </div>`;
  } else if (ui.step === 1) {
    body = `
      <div class="card">
        <h2>What’s your main goal for the next 3 months?</h2>
        ${choice('goal', 'fat_loss', GOALS.fat_loss, 'Drop body fat while keeping muscle and strength', d.goal)}
        ${choice('goal', 'muscle', GOALS.muscle, 'Add size with a small calorie surplus', d.goal)}
        ${choice('goal', 'recomp', GOALS.recomp, 'Look leaner at the same weight (great for beginners)', d.goal)}
        ${choice('goal', 'strength', GOALS.strength, 'Lift heavier on squat, bench, deadlift, press', d.goal)}
        ${choice('goal', 'endurance', GOALS.endurance, 'Fitter heart & lungs, higher-rep strength', d.goal)}
        ${choice('goal', 'general', GOALS.general, 'Feel better, move better, stay consistent', d.goal)}
        <label class="field" style="margin-top:8px">Target weight (${U}, optional)<input data-bind="targetWeight" type="number" inputmode="decimal" value="${esc(d.targetWeight)}"></label>
      </div>`;
  } else if (ui.step === 2) {
    body = `
      <div class="card stack">
        <h2>Your training setup</h2>
        <div><label class="field">Lifting experience</label>
          ${choice('experience', 'beginner', 'Beginner', 'Less than ~1 year of consistent lifting', d.experience)}
          ${choice('experience', 'intermediate', 'Intermediate', '1–3 years, you know the main lifts', d.experience)}
          ${choice('experience', 'advanced', 'Advanced', '3+ years of structured training', d.experience)}
        </div>
        <div><label class="field">Days per week you can train</label>${seg('days', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], d.days)}</div>
        <div><label class="field">Minutes per session</label>${seg('minutes', [[30, '30'], [45, '45'], [60, '60'], [75, '75'], [90, '90']], d.minutes)}</div>
        <div><label class="field">Equipment</label>
          ${choice('equipment', 'gym', 'Full gym', 'Barbells, machines, cables, dumbbells', d.equipment)}
          ${choice('equipment', 'db', 'Dumbbells + bench', 'Home gym or hotel gym', d.equipment)}
          ${choice('equipment', 'bw', 'Bodyweight only', 'No equipment — a backpack helps', d.equipment)}
        </div>
        <div><label class="field">Daily activity outside the gym</label>${seg('activity', [['sedentary', 'Desk job'], ['light', 'Light'], ['moderate', 'On my feet'], ['high', 'Physical job']], d.activity)}</div>
      </div>`;
  } else if (ui.step === 3) {
    const lifts = [['squat', 'Squat'], ['bench', 'Bench press'], ['deadlift', 'Deadlift'], ['ohp', 'Overhead press'], ['row', 'Barbell / DB row']];
    body = `
      <div class="card stack">
        <h2>How are you training right now?</h2>
        <p class="muted small" style="margin:0">This is how the coach meets you where you are instead of starting from zero.</p>
        <div><label class="field">Days per week you train now</label>${seg('currentDays', [[0, 'None'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5+']], d.currentDays)}</div>
        <label class="field">Describe your current routine, what’s working and what isn’t
          <textarea data-bind="currentRoutine" placeholder="e.g. I do chest/back/arms 4x a week, skip legs, run 5 km on weekends. Stuck on bench for months.">${esc(d.currentRoutine)}</textarea></label>
        <div>
          <label class="field">Current working weights (optional)</label>
          <p class="muted small" style="margin:4px 0 8px">A weight you can lift for the given reps with good form. Leave blank if unsure — the app learns from your first workouts.</p>
          ${lifts.map(([k, l]) => `<div class="set" style="grid-template-columns:1.4fr 1fr 1fr;margin-bottom:6px"><span class="small">${l}</span>
            <input type="number" inputmode="decimal" placeholder="${U}" data-bind="lifts.${k}.w" value="${esc(d.lifts[k].w)}" aria-label="${l} weight">
            <input type="number" inputmode="numeric" placeholder="reps" data-bind="lifts.${k}.r" value="${esc(d.lifts[k].r)}" aria-label="${l} reps"></div>`).join('')}
        </div>
        <div>
          <label class="field">Quick fitness test (optional)</label>
          <p class="muted small" style="margin:4px 0 8px">Max in one go with good form — do it now or give your best guess.</p>
          <div class="grid3">
            <label class="field">Push-ups<input type="number" inputmode="numeric" data-bind="pushups" value="${esc(d.pushups)}"></label>
            <label class="field">Pull-ups<input type="number" inputmode="numeric" data-bind="pullups" value="${esc(d.pullups)}"></label>
            <label class="field">Plank (sec)<input type="number" inputmode="numeric" data-bind="plankSec" value="${esc(d.plankSec)}"></label>
          </div>
        </div>
        <div><label class="field">Average sleep per night</label>${seg('sleepHours', [[5, 'Under 6 h'], [6, '6 h'], [7, '7 h'], [8, '8+ h']], d.sleepHours)}</div>
        <div><label class="field">Cardio you do now (minutes / week)</label>${seg('cardioMin', [[0, 'None'], [30, '~30'], [90, '~90'], [150, '150+']], d.cardioMin)}</div>
        <div><label class="field">Any injuries or problem areas?</label>
          <div class="seg">${[['knee', 'Knees'], ['lower_back', 'Lower back'], ['shoulder', 'Shoulders']].map(([v, l]) => `<button type="button" data-toggle="injuries" data-val="${v}" aria-pressed="${d.injuries.includes(v)}">${l}</button>`).join('')}</div>
        </div>
      </div>`;
  } else {
    const p = profileFromDraft(d);
    const pl = p ? generatePlan(p, state.adjustments || defaultAdjustments(), state.exState || {}, (kg) => `${d.units === 'lb' ? Math.round(kg * LB) : Math.round(kg * 10) / 10} ${d.units}`) : null;
    body = p ? `
      <div class="card hero">
        <div class="muted small">Your 12-week plan</div>
        <h2 style="font-size:22px;margin:4px 0 6px">${esc(GOALS[p.goal])}</h2>
        <div>${esc(pl.split)} · ${p.days} days · ${p.minutes} min</div>
        <div class="timeline">${pl.weeks.map((w) => `<i class="${w.deload ? 'deload' : ''}"></i>`).join('')}</div>
        <div class="small muted">Foundation → Build → Peak, with a deload every 4th week</div>
      </div>
      <div class="card">
        <h2>Daily targets</h2>
        ${nutritionKpis(pl.nutrition)}
      </div>
      <div class="card"><h2>Built from your inputs</h2><ul class="list small">${pl.inputs.map(([k, v]) => `<li><b>${esc(k)}</b><br><span class="muted">${esc(v)}</span></li>`).join('')}</ul>
        ${pl.projection.targetNote ? `<p class="small" style="margin:8px 0 0"><b>${esc(pl.projection.targetNote)}</b></p>` : ''}</div>
      ${editing ? `<div class="card"><label class="row" style="gap:12px"><input type="checkbox" data-bind="restart" ${d.restart ? 'checked' : ''} style="width:22px;height:22px"> <span>Restart at week 1 today (keeps your history and learned weights)</span></label></div>` : ''}
    ` : `<div class="card"><h2>Missing info</h2><p class="muted">Please go back and fill in age, height and weight.</p></div>`;
  }
  $view.innerHTML = `
    <div class="progress-dots">${WIZ_STEPS.map((_, i) => `<i class="${i === ui.step ? 'on' : ''}"></i>`).join('')}</div>
    ${body}
    <div class="row" style="margin-top:6px">
      ${ui.step > 0 ? '<button class="btn" data-action="wiz-back">Back</button>' : ''}
      <button class="btn primary block" data-action="wiz-next">${ui.step === WIZ_STEPS.length - 1 ? (editing ? 'Save & update plan' : 'Build my plan') : 'Continue'}</button>
    </div>`;
}

const intOrNull = (v) => (v === '' || v == null || !Number.isFinite(parseInt(v, 10)) ? null : Math.max(0, parseInt(v, 10)));
function profileFromDraft(d) {
  const age = parseInt(d.age, 10);
  const heightCm = d.units === 'kg' ? parseFloat(d.height) : ((parseFloat(d.heightFt) || 0) * 12 + (parseFloat(d.heightIn) || 0)) * 2.54;
  const weightKg = toKg(d.weight, d.units);
  if (!(age >= 13 && age <= 90) || !(heightCm > 120 && heightCm < 230) || !(weightKg > 30 && weightKg < 300)) return null;
  const lifts = {};
  for (const [k, v] of Object.entries(d.lifts)) {
    const w = toKg(v.w, d.units);
    const r = parseInt(v.r, 10);
    if (w > 0 && r > 0 && r <= 20) lifts[k] = { w, r };
  }
  return {
    name: d.name.trim(), units: d.units, sex: d.sex, age, heightCm: Math.round(heightCm), weightKg: Math.round(weightKg * 10) / 10,
    targetWeightKg: toKg(d.targetWeight, d.units), goal: d.goal, experience: d.experience, days: Number(d.days),
    minutes: Number(d.minutes), equipment: d.equipment, activity: d.activity, currentDays: Number(d.currentDays),
    currentRoutine: d.currentRoutine.trim(), injuries: d.injuries, lifts,
    pushups: intOrNull(d.pushups), pullups: intOrNull(d.pullups), plankSec: intOrNull(d.plankSec),
    sleepHours: Number(d.sleepHours) || null, cardioMin: Number(d.cardioMin),
  };
}

function wizardNext() {
  const d = ui.wizard;
  if (ui.step === 0 && !profileFromDraft(d)) { toast('Please enter a valid age, height and weight.'); return; }
  if (ui.step < WIZ_STEPS.length - 1) { ui.step++; render(); window.scrollTo(0, 0); return; }
  const p = profileFromDraft(d);
  if (!p) { ui.step = 0; render(); return; }
  const isNew = !state.profile;
  state.profile = p;
  if (isNew || d.restart) {
    state.startDate = todayIso();
    state.adjustments = { ...defaultAdjustments(), swaps: state.adjustments?.swaps || {} };
    addEvent(isNew ? `Plan created: ${GOALS[p.goal]}, ${p.days} days/week.` : 'Plan restarted at week 1.');
  } else {
    addEvent('Profile updated — plan regenerated.');
  }
  ui.wizard = null; ui.step = 0; ui.tab = 'today'; ui.day = null;
  persist();
  render();
  window.scrollTo(0, 0);
}

function nutritionKpis(n) {
  return `<div class="kpis">
    <div class="kpi"><b>${n.calories}</b><span>kcal</span></div>
    <div class="kpi"><b>${n.protein}g</b><span>protein</span></div>
    <div class="kpi"><b>${n.carbs}g</b><span>carbs</span></div>
    <div class="kpi"><b>${n.fat}g</b><span>fat</span></div>
  </div>
  <p class="small muted" style="margin:10px 0 0">Maintenance ≈ ${n.tdee} kcal · Water ≈ ${n.waterL} L · Fibre ≈ ${n.fiberG} g</p>`;
}

// ---------- TODAY
function renderToday() {
  const pl = plan();
  const elapsed = planDaysElapsed();
  const autoWeek = currentWeek(state.startDate);
  const week = ui.week ?? autoWeek;
  const wk = pl.weeks[week - 1];
  const loggedIdx = new Set(state.logs.filter((l) => l.week === week).map((l) => l.dayIndex));
  if (ui.day == null || ui.day >= wk.days.length) {
    ui.day = wk.days.findIndex((_, i) => !loggedIdx.has(i));
    if (ui.day < 0) ui.day = 0;
  }
  const day = wk.days[ui.day];
  const hello = state.profile.name ? `Hi ${state.profile.name}` : 'Today';
  setTop(hello, `Week ${week} of ${WEEKS} · ${wk.blockName}${wk.deload ? ' · Deload' : ''}`);

  const done = elapsed >= WEEKS * 7;
  const needsCheckIn = week > 1 && !state.checkIns.some((c) => c.week === week - 1) && week === autoWeek;
  const draftKey = `${week}-${ui.day}`;
  const draft = state.drafts[draftKey] || { sets: {}, rpe: '', notes: '' };
  const existing = state.logs.find((l) => l.week === week && l.dayIndex === ui.day);

  $view.innerHTML = `
    ${done ? `<div class="card"><h2>🎉 12 weeks complete!</h2><p class="muted small">Log a final check-in, then start your next cycle — it keeps everything the app learned about your strength.</p><button class="btn primary block" data-action="new-cycle">Start next 12-week cycle</button></div>` : ''}
    <div class="card hero">
      <div class="row spread"><span class="muted small">Week ${week} · ${esc(wk.blockName)} block</span>${wk.deload ? '<span class="badge">Deload</span>' : `<span class="badge">Leave ${wk.rir} reps in the tank</span>`}</div>
      <div class="timeline" aria-label="12-week progress">${pl.weeks.map((w) => `<i class="${w.week < autoWeek ? 'done' : w.week === autoWeek ? 'now' : ''}"></i>`).join('')}</div>
      <div class="row spread small"><span>${Math.round(adherence(state, week) * 100)}% of this week done</span>
        <span>${week !== autoWeek ? `<button class="linkbtn" style="color:#fff" data-action="week-now">Back to this week</button>` : ''}</span></div>
    </div>
    ${needsCheckIn ? `<div class="card" style="border-color:var(--accent)"><div class="row spread"><div><h3>Weekly check-in due</h3><div class="muted small">2 minutes — this is how your plan adapts.</div></div><button class="btn primary sm" data-action="goto-checkin">Check in</button></div></div>` : ''}
    <div class="row spread" style="margin:4px 0 8px"><div class="chips">${wk.days.map((d, i) => `<button class="chip" data-action="pick-day" data-i="${i}" aria-pressed="${i === ui.day}">${loggedIdx.has(i) ? '<span class="dot">✓</span> ' : ''}${esc(d.name)}</button>`).join('')}</div></div>
    <div class="row spread" style="margin-bottom:8px">
      <button class="btn sm" data-action="week-prev" ${week <= 1 ? 'disabled' : ''} aria-label="Previous week">‹ Wk ${Math.max(1, week - 1)}</button>
      <span class="small muted">${esc(day.focus)}</span>
      <button class="btn sm" data-action="week-next" ${week >= WEEKS ? 'disabled' : ''} aria-label="Next week">Wk ${Math.min(WEEKS, week + 1)} ›</button>
    </div>
    ${existing ? `<div class="card small"><b>✓ Logged ${esc(existing.date)}.</b> <span class="muted">Saving again replaces that log.</span></div>` : ''}
    <div class="card">
      <h2>${esc(day.name)}</h2>
      <div class="muted small" style="margin-bottom:6px">Warm up 5 min + 2 lighter ramp-up sets on the first exercise.</div>
      ${day.exercises.map((ex, xi) => exerciseCard(ex, xi, draft)).join('')}
    </div>
    <div class="card">
      <h3>Finisher</h3><p class="small" style="margin:0 0 10px">${esc(day.finisher)}</p>
      <h3>This week’s cardio</h3><p class="small" style="margin:0">${esc(wk.cardio.sessions)} · ${wk.cardio.steps.toLocaleString()} steps/day</p>
    </div>
    <div class="card stack">
      <div><label class="field">How hard was the session overall? (RPE 1–10)</label>${seg('rpe', [[5, '≤5'], [6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10']], draft.rpe)}</div>
      <label class="field">Notes (pain, energy, anything unusual)<textarea data-draft="notes" class="input">${esc(draft.notes)}</textarea></label>
      <button class="btn primary block" data-action="finish">Finish & save workout</button>
    </div>`;
  renderTimer();
}

function exerciseCard(ex, xi, draft) {
  const u = units();
  const sets = draft.sets[ex.id] || [];
  const isBw = ex.loadType === 'bw';
  const loadTxt = isBw ? 'bodyweight' : ex.load != null ? `${showW(ex.load)} ${u}${ex.loadType === 'db' ? ' each hand' : ''}` : `pick a weight you can do for ${ex.reps[1] + ex.rir} reps`;
  const rows = Array.from({ length: ex.sets }, (_, si) => {
    const s = sets[si] || {};
    const w = s.w ?? (isBw ? '' : showW(ex.load));
    return `<div class="set">
      <span class="n">${si + 1}</span>
      <input type="number" inputmode="decimal" step="any" placeholder="${isBw ? '+kg' : u}" value="${esc(w)}" data-set-w="${ex.id}" data-si="${si}" aria-label="Set ${si + 1} weight">
      <input type="number" inputmode="numeric" placeholder="${ex.reps[0]}–${ex.reps[1]}" value="${esc(s.r ?? '')}" data-set-r="${ex.id}" data-si="${si}" aria-label="Set ${si + 1} reps">
      <button class="tick" data-action="tick" data-ex="${ex.id}" data-si="${si}" data-rest="${ex.rest}" aria-pressed="${!!s.done}" aria-label="Mark set ${si + 1} done">✓</button>
    </div>`;
  }).join('');
  return `<div class="ex">
    <div class="row" style="align-items:flex-start">
      <button class="thumb" data-action="ex-info" data-id="${ex.id}" aria-label="How to do ${esc(ex.name)}">${demoSvg(ex.pattern, ex.name)}</button>
      <div style="flex:1;min-width:0"><div class="title">${xi + 1}. ${esc(ex.name)}</div>
        <div class="rx">${ex.sets} × ${ex.reps[0]}–${ex.reps[1]} · ${esc(loadTxt)} · rest ${ex.rest < 120 ? `${ex.rest}s` : `${ex.rest / 60} min`}</div>
        <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" data-action="ex-info" data-id="${ex.id}">▶ How to</button><button class="btn sm" data-action="swap" data-slot="${esc(ex.slotKey)}" data-pattern="${ex.pattern}" aria-label="Swap ${esc(ex.name)}">Swap</button></div>
      </div>
    </div>
    ${ex.note ? `<div class="note small">💡 ${esc(ex.note)}</div>` : ''}
    <details><summary>${ex.loadSource ? `Weight from ${esc(ex.loadSource)}` : 'First time? Start light'}</summary>
      ${esc(ex.cue)}${ex.lastReps ? `<br>Last time: ${ex.lastReps.join(', ')} reps.` : ''}
      <br>Hit ${ex.reps[1]} reps on every set → the weight goes up automatically next time.</details>
    <div class="sets"><div class="sethead"><span>Set</span><span>${isBw ? 'Extra' : u}</span><span>Reps</span><span></span></div>${rows}</div>
  </div>`;
}

function draftFor() {
  const week = ui.week ?? currentWeek(state.startDate);
  const key = `${week}-${ui.day}`;
  if (!state.drafts[key]) state.drafts[key] = { sets: {}, rpe: '', notes: '' };
  return state.drafts[key];
}

function finishWorkout() {
  const pl = plan();
  const week = ui.week ?? currentWeek(state.startDate);
  const day = pl.weeks[week - 1].days[ui.day];
  const draft = draftFor();
  const entries = day.exercises.map((ex) => {
    const sets = (draft.sets[ex.id] || []).map((s, si) => {
      const wRaw = s.w ?? (ex.loadType === 'bw' ? '' : showW(ex.load));
      return { w: Math.round((toKg(wRaw) || 0) * 10) / 10, r: parseInt(s.r, 10) || 0 };
    }).filter((s) => s.r > 0);
    return { id: ex.id, sets };
  }).filter((e) => e.sets.length);
  if (!entries.length) { toast('Enter reps for at least one set first.'); return; }

  const prs = prMessages(detectPRs(state.logs.filter((l) => !(l.week === week && l.dayIndex === ui.day)), entries));
  prs.forEach((m) => addEvent(m, 'pr'));
  const { exState, notes: coachNotes } = applyWorkout(state, day, entries);
  const notes = [...prs, ...coachNotes];
  state.exState = exState;
  state.logs = state.logs.filter((l) => !(l.week === week && l.dayIndex === ui.day));
  state.logs.push({ date: todayIso(), week, dayIndex: ui.day, dayName: day.name, entries, rpe: draft.rpe ? Number(draft.rpe) : null, notes: draft.notes || '' });
  delete state.drafts[`${week}-${ui.day}`];
  stopTimer();
  const weekDone = state.logs.filter((l) => l.week === week).length >= state.profile.days;
  persist();
  showSheet(`<h2>Workout saved 💪</h2>
    <ul class="list small">${(notes.length ? notes : ['Solid session — everything on target. Keep going.']).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    ${weekDone ? '<p class="small"><b>Week complete!</b> Do your weekly check-in so next week adapts to you.</p>' : ''}
    <button class="btn primary block" data-action="${weekDone ? 'goto-checkin' : 'close-sheet'}" style="margin-top:8px">${weekDone ? 'Check in now' : 'Done'}</button>`);
  ui.day = null;
  render();
}

// ---------- rest timer
function startTimer(sec) {
  ui.timer = { end: Date.now() + sec * 1000, total: sec };
  clearInterval(ui.timerIv);
  ui.timerIv = setInterval(renderTimer, 500);
  renderTimer();
}
function stopTimer() {
  clearInterval(ui.timerIv);
  ui.timer = null;
  document.querySelector('.timer')?.remove();
  document.body.classList.remove('timing');
}
function renderTimer() {
  let el = document.querySelector('.timer');
  if (!ui.timer) { el?.remove(); return; }
  const left = Math.max(0, Math.round((ui.timer.end - Date.now()) / 1000));
  if (!el) {
    el = document.createElement('div');
    el.className = 'timer';
    document.body.classList.add('timing');
    el.innerHTML = '<div><div class="small muted">Rest</div><b></b></div><div class="row"><button class="btn sm" data-action="timer-add">+30s</button><button class="btn sm" data-action="timer-stop">Skip</button></div>';
    document.body.appendChild(el);
  }
  el.querySelector('b').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (left === 0) { beep(); stopTimer(); toast('Rest over — next set!'); }
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35);
    navigator.vibrate?.(300);
  } catch { /* audio not allowed */ }
}

// ---------- PLAN
function renderPlan() {
  const pl = plan();
  const now = currentWeek(state.startDate);
  const p = state.profile;
  const pr = pl.projection;
  const u = units();
  setTop('Your 12-week plan', `${pl.split} · started ${state.startDate}`);
  $view.innerHTML = `
    <div class="card">
      <h2>${esc(GOALS[p.goal])}</h2>
      ${pl.blocks.map((b, i) => `<div class="row" style="align-items:flex-start;margin-top:8px"><span class="badge ${blockOfNow(now) === i ? '' : 'warn'}" style="min-width:74px;text-align:center">Wk ${b.weeks[0]}–${b.weeks[3]}</span><div><b>${esc(b.name)}</b><div class="small muted">${esc(b.summary)}</div></div></div>`).join('')}
    </div>
    <div class="card"><h2>Daily nutrition</h2>${nutritionKpis(pl.nutrition)}
      ${state.adjustments.calorieDelta ? `<p class="small" style="margin:8px 0 0">Auto-adjusted by <b>${state.adjustments.calorieDelta > 0 ? '+' : ''}${state.adjustments.calorieDelta} kcal</b> from your check-ins.</p>` : ''}
    </div>
    <div class="card"><h2>What to expect by week 12</h2>
      <p class="small" style="margin:0">Bodyweight: <b>${showW(pr.weightRange[0])}–${showW(pr.weightRange[1])} ${u}</b> (${pr.weeklyRatePct[0]}% to ${pr.weeklyRatePct[1]}% per week).<br>
      Strength on main lifts: <b>+${pr.strengthGainPct[0]}–${pr.strengthGainPct[1]}%</b> if you hit ~90% of sessions.</p>
      ${pr.targetNote ? `<p class="small" style="margin:8px 0 0">${esc(pr.targetNote)}</p>` : ''}
    </div>
    <div class="card"><h2>Built from your inputs</h2>
      <ul class="list small">${pl.inputs.map(([k, v]) => `<li><b>${esc(k)}</b><br><span class="muted">${esc(v)}</span></li>`).join('')}</ul>
      <button class="btn sm" data-action="edit-profile" style="margin-top:8px">Change my inputs</button>
    </div>
    <div class="card"><h2>Week by week</h2>
      ${pl.weeks.map((w) => `<details class="week" ${w.week === (ui.planWeek ?? now) ? 'open' : ''}>
        <summary><span>Week ${w.week} <span class="muted small">· ${esc(w.blockName)}</span></span>${w.deload ? '<span class="badge warn">Deload</span>' : w.week === now ? '<span class="badge">Now</span>' : `<span class="small muted">${w.rir} RIR</span>`}</summary>
        ${w.days.map((d) => `<h3 style="margin-top:6px">${esc(d.name)} <span class="muted small">· ${esc(d.focus)}</span></h3>
          <table class="plan">${d.exercises.map((e) => `<tr><td><button class="linkbtn" style="padding:0;text-align:left;font-weight:500" data-action="ex-info" data-id="${e.id}">${esc(e.name)}</button></td><td class="r">${e.sets}×${e.reps[0]}–${e.reps[1]}${e.load != null ? ` · ${showW(e.load)}${u}` : ''}</td></tr>`).join('')}</table>`).join('')}
        <p class="small muted">Cardio: ${esc(w.cardio.sessions)} · ${w.cardio.steps.toLocaleString()} steps/day</p>
      </details>`).join('')}
    </div>
    <div class="card"><h2>Why it’s built this way</h2><ul class="small" style="padding-left:18px;margin:0">${pl.rationale.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
}
const blockOfNow = (w) => Math.min(2, Math.floor((w - 1) / 4));

// ---------- PROGRESS
function renderLog() {
  const u = units();
  const view = ui.logView;
  const recs = records(state.logs);
  const thisWeek = weekStart(todayIso());
  const weekLogs = state.logs.filter((l) => weekStart(l.date) === thisWeek);
  const planned = weekLogs.filter((l) => l.dayIndex >= 0).length;
  const vol = weekLogs.reduce((a, l) => a + l.entries.reduce((b, e) => b + e.sets.reduce((c, st) => c + (st.w || 0) * (st.r || 0), 0), 0), 0);
  const prCount = state.events.filter((e) => e.kind === 'pr').length;
  setTop('Gym log', `${state.logs.length} workouts logged`);
  let body = '';
  if (view === 'history') body = logHistoryHtml();
  else if (view === 'records') body = logRecordsHtml(recs);
  else if (view === 'checkin') body = checkInHtml();
  else body = chartsHtml();
  $view.innerHTML = `
    <div class="kpis" style="margin-bottom:12px">
      <div class="kpi"><b>${planned}/${state.profile.days}</b><span>this week</span></div>
      <div class="kpi"><b>${vol ? Math.round(Number(showW(vol)) / 100) / 10 + 'k' : 0}</b><span>${u} lifted</span></div>
      <div class="kpi"><b>${streakWeeks(state.logs)}</b><span>wk streak</span></div>
      <div class="kpi"><b>${prCount}</b><span>PRs</span></div>
    </div>
    <button class="btn primary block" data-action="free-log" style="margin-bottom:12px">＋ Log an extra exercise</button>
    <div class="chips" style="margin-bottom:12px" role="tablist">${[['history', 'History'], ['records', 'Records'], ['checkin', 'Check-in'], ['charts', 'Charts']].map(([k, l]) => `<button class="chip" role="tab" data-action="log-view" data-v="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>
    ${body}`;
}

function logHistoryHtml() {
  if (!state.logs.length) return '<div class="card"><p class="muted small" style="margin:0">No workouts yet — start on the Today tab, or log an extra exercise above.</p></div>';
  return `<div class="card"><ul class="list small">${state.logs.slice().reverse().slice(0, 40).map((l) => `<li>
      <div class="row spread"><b>${esc(l.date)} · ${l.week > 0 ? `W${l.week}` : 'Prev. cycle'} ${esc(l.dayName)}</b><button class="linkbtn" data-action="del-log" data-date="${esc(l.date)}" data-week="${l.week}" data-day="${l.dayIndex}" aria-label="Delete log">Delete</button></div>
      ${l.entries.map((e) => `<div class="row spread" style="padding:3px 0"><button class="linkbtn" style="padding:0;text-align:left" data-action="ex-history" data-id="${e.id}">${esc(BY_ID[e.id]?.name || e.id)}</button><span class="muted" style="text-align:right">${e.sets.map((st) => `${st.w ? showW(st.w) : 'BW'}×${st.r}`).join(', ')}</span></div>`).join('')}
      ${l.rpe || l.notes ? `<div class="muted">${l.rpe ? `RPE ${l.rpe}` : ''}${l.rpe && l.notes ? ' · ' : ''}${esc(l.notes || '')}</div>` : ''}
    </li>`).join('')}</ul></div>`;
}

function logRecordsHtml(recs) {
  const u = units();
  const ids = Object.keys(recs).sort((a, b) => (recs[b].lastDate || '').localeCompare(recs[a].lastDate || ''));
  if (!ids.length) return '<div class="card"><p class="muted small" style="margin:0">Your personal records appear here after your first workout.</p></div>';
  return `<div class="card"><h2>Personal records</h2><ul class="list small">${ids.map((id) => {
    const r = recs[id];
    const ex = BY_ID[id];
    return `<li><button class="rowbtn" data-action="ex-history" data-id="${id}">
      <span class="thumb">${demoSvg(ex?.pattern, ex?.name)}</span>
      <span style="flex:1;min-width:0"><b>${esc(ex?.name || id)}</b><br>
      <span class="muted">${r.best ? `Best: ${showW(r.best.w)} ${u} × ${r.best.r} · est. max ${showW(r.best.e1rm)} ${u}` : `Most reps: ${r.mostReps?.r ?? 0}`}<br>${r.sessions} session${r.sessions === 1 ? '' : 's'} · last ${esc(r.lastDate)}</span></span>
      <span class="muted">›</span></button></li>`;
  }).join('')}</ul></div>`;
}

function checkInHtml() {
  const week = currentWeek(state.startDate);
  const u = units();
  if (!ui.ci) {
    const lastDone = state.checkIns.some((c) => c.week === week - 1) || week === 1 ? week : week - 1;
    ui.ci = { week: lastDone, weight: '', sleep: 3, energy: 3, soreness: 3, pain: [], notes: '' };
  }
  const ci = ui.ci;
  return `
    <div class="card stack" id="checkin">
      <h2>Weekly check-in</h2>
      <p class="muted small" style="margin:0">Once a week, same time of day (morning, before food). Your calories, training volume and exercises adapt from it.</p>
      <div class="grid2">
        <label class="field">For week<select data-ci="week" class="input">${Array.from({ length: WEEKS }, (_, i) => `<option value="${i + 1}" ${ci.week === i + 1 ? 'selected' : ''}>Week ${i + 1}${state.checkIns.some((c) => c.week === i + 1) ? ' ✓' : ''}</option>`).join('')}</select></label>
        <label class="field">Bodyweight (${u})<input data-ci="weight" type="number" inputmode="decimal" value="${esc(ci.weight)}"></label>
      </div>
      ${[['sleep', 'Sleep quality', ['Awful', 'Poor', 'OK', 'Good', 'Great']], ['energy', 'Energy in workouts', ['Drained', 'Low', 'OK', 'Good', 'Great']], ['soreness', 'Soreness / joint aches', ['None', 'Mild', 'Some', 'High', 'Very high']]]
        .map(([k, l, labels]) => `<div><label class="field">${l}</label><div class="seg">${labels.map((t, i) => `<button type="button" data-ci-set="${k}" data-val="${i + 1}" aria-pressed="${Number(ci[k]) === i + 1}">${t}</button>`).join('')}</div></div>`).join('')}
      <div><label class="field">Any pain this week?</label><div class="seg">${[['knee', 'Knee'], ['lower_back', 'Lower back'], ['shoulder', 'Shoulder']].map(([v, l]) => `<button type="button" data-ci-toggle="${v}" aria-pressed="${ci.pain.includes(v)}">${l}</button>`).join('')}</div></div>
      <label class="field">Anything else?<textarea data-ci="notes" class="input" placeholder="Travel, illness, stress, cravings…">${esc(ci.notes)}</textarea></label>
      <button class="btn primary block" data-action="submit-checkin">Save check-in & adapt my plan</button>
    </div>
    <div class="card"><h2>Coach decisions</h2>
      ${state.events.length ? `<ul class="list small">${state.events.slice().reverse().slice(0, 20).map((e) => `<li><span class="muted">${esc(e.date)}</span> — ${esc(e.text)}</li>`).join('')}</ul>` : '<p class="muted small">Automatic adjustments will show up here.</p>'}
    </div>`;
}

function chartsHtml() {
  const u = units();
  const bw = [{ label: state.startDate, v: state.profile.weightKg }, ...state.checkIns.filter((c) => c.weightKg).map((c) => ({ label: c.date, v: c.weightKg }))]
    .map((p) => ({ label: p.label, v: Number(showW(p.v)) }));
  const trackable = Object.entries(state.exState).filter(([, st]) => (st.history || []).length >= 2).map(([id]) => id);
  if (!ui.chartEx || !trackable.includes(ui.chartEx)) ui.chartEx = trackable[0] || null;
  const strength = ui.chartEx ? state.exState[ui.chartEx].history.map((h) => ({ label: h.date, v: Number(showW(h.e1rm)) })) : [];
  return `
    <div class="card"><h2>Bodyweight (${u})</h2>${bw.length >= 2 ? lineChart(bw, u) : '<p class="muted small">Your trend appears after your first check-in.</p>'}</div>
    <div class="card"><div class="row spread"><h2 style="margin:0">Estimated max (${u})</h2>
      ${trackable.length ? `<select class="input" style="width:auto;min-height:36px;margin:0;padding:6px 10px" data-action-change="chart-ex">${trackable.map((id) => `<option value="${id}" ${id === ui.chartEx ? 'selected' : ''}>${esc(BY_ID[id].name)}</option>`).join('')}</select>` : ''}</div>
      ${strength.length >= 2 ? lineChart(strength, u) : '<p class="muted small">Log the same exercise twice to see your strength trend.</p>'}
    </div>`;
}

// ---------- exercise guide sheets
function exInfoSheet(id) {
  const ex = BY_ID[id];
  if (!ex) return;
  const g = PATTERN_GUIDE[ex.pattern];
  const r = records(state.logs)[id];
  const u = units();
  showSheet(`
    <div class="row spread"><h2 style="margin:0">${esc(ex.name)}</h2><button class="linkbtn" data-action="close-sheet">Close</button></div>
    <div class="muted small" style="margin:2px 0 10px">${esc(PATTERN_LABEL[ex.pattern])} · ${esc(g.muscles)}</div>
    <div class="demo-big">${demoSvg(ex.pattern, ex.name)}</div>
    <p class="small muted" style="text-align:center;margin:6px 0 10px">Movement pattern animation · tempo: 2–3 s lowering, 1 s lifting</p>
    <a class="btn block" href="${videoUrl(ex)}" target="_blank" rel="noopener">▶ Watch video demos (YouTube)</a>
    <div class="guide-sec"><h3>Key cue</h3><p>${esc(ex.cue)}</p></div>
    <div class="guide-sec"><h3>Step by step</h3><ol>${g.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    <div class="guide-sec"><h3>Common mistakes</h3><ul>${g.mistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="guide-sec"><h3>Breathing</h3><p>${esc(g.breathing)}</p></div>
    ${r ? `<div class="guide-sec"><h3>Your records</h3><p>${r.best ? `Best set ${showW(r.best.w)} ${u} × ${r.best.r} (est. max ${showW(r.best.e1rm)} ${u}) · ` : ''}${r.sessions} session(s)</p>
      <button class="btn sm" data-action="ex-history" data-id="${id}">See full history</button></div>` : ''}`);
  startDemos(document.querySelector('.sheet'));
}

function exHistorySheet(id) {
  const ex = BY_ID[id];
  const u = units();
  const sessions = state.logs.filter((l) => l.entries.some((e) => e.id === id)).slice().reverse();
  const r = records(state.logs)[id];
  showSheet(`
    <div class="row spread"><h2 style="margin:0">${esc(ex?.name || id)}</h2><button class="linkbtn" data-action="close-sheet">Close</button></div>
    ${r?.best ? `<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:10px 0"><div class="kpi"><b>${showW(r.best.e1rm)}</b><span>est. max ${u}</span></div><div class="kpi"><b>${showW(r.heaviest.w)}</b><span>heaviest ${u}</span></div><div class="kpi"><b>${r.mostReps.r}</b><span>most reps</span></div></div>` : ''}
    <ul class="list small">${sessions.map((l) => { const e = l.entries.find((x) => x.id === id); return `<li><div class="row spread"><b>${esc(l.date)}</b><span class="muted">${esc(l.dayName)}</span></div><div>${e.sets.map((st) => `${st.w ? `${showW(st.w)} ${u}` : 'BW'} × ${st.r}`).join(' · ')}</div></li>`; }).join('') || '<li class="muted">Not logged yet.</li>'}</ul>
    <button class="btn block" data-action="ex-info" data-id="${id}">How to do it</button>`);
}

// ---------- free / extra exercise logging
function freePickerHtml(q = '') {
  const qq = q.trim().toLowerCase();
  const list = EXERCISES.filter((e) => !qq || e.name.toLowerCase().includes(qq) || PATTERN_LABEL[e.pattern].toLowerCase().includes(qq));
  return list.slice(0, 60).map((e) => `<button class="choice" data-action="free-pick" data-id="${e.id}"><strong>${esc(e.name)}</strong><span>${esc(PATTERN_LABEL[e.pattern])}</span></button>`).join('') || '<p class="muted small">No match.</p>';
}
function freeSetsSheet() {
  const f = ui.free;
  const ex = BY_ID[f.id];
  const u = units();
  showSheet(`
    <div class="row spread"><h2 style="margin:0">${esc(ex.name)}</h2><button class="linkbtn" data-action="close-sheet">Cancel</button></div>
    <p class="small muted">${ex.load === 'bw' ? 'Leave weight empty for bodyweight, or enter extra load.' : `Weight in ${u}${ex.load === 'db' ? ' (per dumbbell)' : ''}.`}</p>
    <div class="sets"><div class="sethead" style="grid-template-columns:28px 1fr 1fr"><span>Set</span><span>${u}</span><span>Reps</span></div>
    ${f.sets.map((st, i) => `<div class="set" style="grid-template-columns:28px 1fr 1fr"><span class="n">${i + 1}</span><input type="number" inputmode="decimal" data-free-w="${i}" value="${esc(st.w)}" aria-label="Set ${i + 1} weight"><input type="number" inputmode="numeric" data-free-r="${i}" value="${esc(st.r)}" aria-label="Set ${i + 1} reps"></div>`).join('')}</div>
    <div class="grid2" style="margin-top:12px"><button class="btn" data-action="free-add-set">＋ Add set</button><button class="btn primary" data-action="free-save">Save</button></div>`);
}
function saveFree() {
  const f = ui.free;
  const sets = f.sets.map((st) => ({ w: Math.round((toKg(st.w) || 0) * 10) / 10, r: parseInt(st.r, 10) || 0 })).filter((st) => st.r > 0);
  if (!sets.length) { toast('Enter reps for at least one set.'); return; }
  const entries = [{ id: f.id, sets }];
  const prs = detectPRs(state.logs, entries);
  const reps = sets.map((st) => st.r);
  const synthetic = { deload: false, exercises: [{ id: f.id, reps: [Math.min(...reps), Math.max(...reps)], rir: 2 }] };
  state.exState = applyWorkout(state, synthetic, entries).exState;
  state.logs.push({ date: todayIso(), week: currentWeek(state.startDate), dayIndex: -1, dayName: 'Extra', entries, rpe: null, notes: '' });
  const msgs = prMessages(prs);
  msgs.forEach((m) => addEvent(m, 'pr'));
  ui.free = null;
  persist();
  closeSheet();
  toast(msgs[0] || 'Logged ✓');
  render();
}
function prMessages(prs) {
  const u = units();
  return prs.map((p) => p.kind === 'reps'
    ? `🏆 New rep PR — ${BY_ID[p.id].name}: ${p.r} reps`
    : `🏆 New PR — ${BY_ID[p.id].name}: ${showW(p.w)} ${u} × ${p.r}`);
}

// ---------- GUIDE tab
function renderGuide() {
  setTop('Guide', 'Technique, training & nutrition');
  $view.innerHTML = `
    <div class="card">
      <h2>Exercise library</h2>
      <p class="small muted" style="margin:0 0 8px">${EXERCISES.length} exercises with animations, step-by-step form, common mistakes and video demos. Tap any exercise.</p>
      <input class="input" type="search" id="guide-q" placeholder="Search exercises…" value="${esc(ui.guideQ)}" style="margin:0 0 8px">
      <div class="chips" style="margin-bottom:8px">${[['', 'All'], ...Object.entries(PATTERN_LABEL)].map(([k, l]) => `<button class="chip" data-action="guide-pat" data-p="${k}" aria-pressed="${ui.guidePat === k}">${esc(l)}</button>`).join('')}</div>
      <ul class="list" id="lib-list">${libraryHtml()}</ul>
    </div>
    <div class="card">
      <h2>Training guide</h2>
      ${GUIDE_TOPICS.map((t) => `<details class="week"><summary><span>${esc(t.title)}</span></summary>
        <ul class="small" style="padding-left:18px;margin:0 0 10px">${t.body.map((b) => `<li style="margin-bottom:6px">${esc(b)}</li>`).join('')}</ul></details>`).join('')}
    </div>`;
}
function libraryHtml() {
  const q = ui.guideQ.trim().toLowerCase();
  const eq = state.profile.equipment;
  const rank = { bw: 0, db: 1, gym: 2 };
  const list = EXERCISES.filter((e) => (!ui.guidePat || e.pattern === ui.guidePat) && (!q || e.name.toLowerCase().includes(q) || PATTERN_GUIDE[e.pattern].muscles.toLowerCase().includes(q)));
  return list.map((e) => `<li><button class="rowbtn" data-action="ex-info" data-id="${e.id}">
      <span class="thumb">${demoSvg(e.pattern, e.name)}</span>
      <span style="flex:1;min-width:0"><b>${esc(e.name)}</b><br><span class="muted small">${esc(PATTERN_GUIDE[e.pattern].muscles)}</span>
      ${rank[e.equip] > rank[eq] ? '<br><span class="badge warn">needs more equipment</span>' : ''}</span><span class="muted">›</span></button></li>`).join('') || '<li class="muted small">No exercises match.</li>';
}

function submitCheckIn() {
  const ci = ui.ci;
  const weightKg = toKg(ci.weight);
  const entry = {
    date: todayIso(), week: Number(ci.week), weightKg: weightKg ? Math.round(weightKg * 10) / 10 : null,
    sleep: Number(ci.sleep), energy: Number(ci.energy), soreness: Number(ci.soreness), pain: [...ci.pain], notes: ci.notes,
  };
  state.checkIns = state.checkIns.filter((c) => c.week !== entry.week);
  const { adjustments, messages, checkIn } = applyCheckIn(state, entry);
  state.adjustments = adjustments;
  state.checkIns.push(checkIn);
  state.checkIns.sort((a, b) => a.week - b.week);
  messages.forEach((m) => addEvent(m, 'auto'));
  ui.ci = null;
  persist();
  showSheet(`<h2>Plan updated</h2><ul class="list small">${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
    <p class="small muted">Recovery score ${recoveryScore(checkIn).toFixed(1)}/5.</p>
    <button class="btn primary block" data-action="close-sheet">Got it</button>`);
  render();
}

// simple accessible single-series line chart with tap/hover readout
function lineChart(points, unit) {
  const W = 320, H = 150, L = 34, R = 8, T = 10, B = 22;
  const vs = points.map((p) => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max - min < 1) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v) => T + ((max - v) * (H - T - B)) / (max - min);
  const ticks = [min + pad, (min + max) / 2, max - pad];
  const data = esc(JSON.stringify(points.map((p, i) => [x(i), y(p.v), p.label, p.v])));
  return `<div class="chart" data-points="${data}" data-unit="${esc(unit)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend from ${points[0].v} to ${points.at(-1).v} ${unit}" style="height:auto">
      ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join('')}
      <text class="axis" x="${L}" y="${H - 4}">${esc(points[0].label.slice(5))}</text>
      <text class="axis" x="${W - R}" y="${H - 4}" text-anchor="end">${esc(points.at(-1).label.slice(5))}</text>
      <polyline class="ln" points="${points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
      ${points.length <= 30 ? points.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.v)}" r="4"/>`).join('') : ''}
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    </svg></div>`;
}
function bindCharts() {
  for (const c of $view.querySelectorAll('.chart')) {
    const pts = JSON.parse(c.dataset.points);
    const svg = c.querySelector('svg');
    const cross = c.querySelector('.cross');
    let tip = null;
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      const vx = ((ev.clientX - r.left) / r.width) * 320;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p[0] - vx) < Math.abs(best[0] - vx)) best = p;
      cross.setAttribute('x1', best[0]); cross.setAttribute('x2', best[0]); cross.style.display = '';
      if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; c.appendChild(tip); }
      tip.textContent = `${best[2]}: ${best[3]} ${c.dataset.unit}`;
      tip.style.left = `${(best[0] / 320) * 100}%`;
      tip.style.top = `${(best[1] / 150) * r.height}px`;
    };
    const hide = () => { cross.style.display = 'none'; tip?.remove(); tip = null; };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }
}

// ---------- COACH (Gen-AI)
function renderCoach() {
  const ai = state.ai;
  const configured = ai.mode === 'local' || (ai.baseUrl && ai.remoteModel);
  setTop('AI Coach', ai.mode === 'local' ? 'On-device open-source model' : `Remote · ${ai.remoteModel || 'not set'}`);
  const gpu = webgpuAvailable();
  $view.innerHTML = `
    <details class="card" ${configured && state.chat.length ? '' : 'open'}>
      <summary style="font-weight:700">AI settings</summary>
      <div class="stack" style="margin-top:10px">
        ${seg('ai.mode', [['local', 'On-device (free, private)'], ['remote', 'Remote (free API / own PC)']], ai.mode)}
        ${ai.mode === 'local' ? `
          <p class="small muted" style="margin:0">Runs an open-source model (Apache-2.0 / Llama licence) fully on your iPhone using WebGPU. One-time download over Wi-Fi, then works offline. Needs iOS 26 or newer. ${gpu ? '✅ WebGPU detected.' : '⚠️ WebGPU not detected on this browser — use Remote mode, or update iOS.'}</p>
          <label class="field">Model<select class="input" data-ai="localModel">${LOCAL_MODELS.map((m) => `<option value="${m.id}" ${m.id === ai.localModel ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
          <div class="row"><button class="btn sm" data-action="ai-load">Download / load model</button><button class="btn sm danger" data-action="ai-delete">Delete model</button></div>
        ` : `
          <p class="small muted" style="margin:0">Any OpenAI-compatible server. Free options: Groq or OpenRouter free models (create a free key), or Ollama / LM Studio on your own computer behind an HTTPS tunnel.</p>
          <div class="row wrap">
            <button class="btn sm" data-action="ai-preset" data-p="groq">Groq preset</button>
            <button class="btn sm" data-action="ai-preset" data-p="openrouter">OpenRouter preset</button>
            <button class="btn sm" data-action="ai-preset" data-p="ollama">Ollama preset</button>
          </div>
          <label class="field">API base URL<input class="input" data-ai="baseUrl" value="${esc(ai.baseUrl)}" placeholder="https://api.groq.com/openai/v1" autocapitalize="off" autocorrect="off"></label>
          <label class="field">Model name<input class="input" data-ai="remoteModel" value="${esc(ai.remoteModel)}" placeholder="llama-3.3-70b-versatile" autocapitalize="off" autocorrect="off"></label>
          <label class="field">API key (stored only on this phone)<input class="input" type="password" data-ai="apiKey" value="${esc(ai.apiKey)}" autocomplete="off"></label>
        `}
        <div class="small" id="ai-status" aria-live="polite">${esc(ui.aiStatus)}</div>
      </div>
    </details>
    <div class="card">
      <div id="chat">${state.chat.length ? state.chat.map((m, i) => chatBubble(m, i)).join('') : `<p class="muted small">Ask anything about your plan, form, food or motivation. The coach sees your profile, this week’s plan, recent workouts and check-ins.</p>`}</div>
      <div class="chips" style="margin:8px 0">${QUICK_PROMPTS.map((q) => `<button class="chip" data-action="ai-quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="composer">
        <textarea id="ai-input" class="input" rows="1" placeholder="Message your coach…" style="margin:0"></textarea>
        ${ui.aiBusy ? '<button class="btn" data-action="ai-stop">Stop</button>' : '<button class="btn primary" data-action="ai-send">Send</button>'}
      </div>
      ${state.chat.length ? '<button class="linkbtn small" data-action="ai-clear" style="margin-top:8px">Clear chat</button>' : ''}
    </div>`;
  const chatEl = document.getElementById('chat');
  chatEl.lastElementChild?.scrollIntoView({ block: 'end' });
}

function chatBubble(m, i) {
  const text = m.content.replace(/ADJUST\s*\{[^}]*\}/, '').trim();
  const adj = m.role === 'assistant' ? parseAdjust(m.content) : null;
  return `<div class="msg ${m.role}" data-msg="${i}">${esc(text) || '<span class="muted">…</span>'}${adj && !m.applied ? `<div style="margin-top:8px"><button class="btn sm primary" data-action="ai-apply" data-i="${i}">Apply: ${adj.calorieDelta ? `${adj.calorieDelta > 0 ? '+' : ''}${adj.calorieDelta} kcal/day ` : ''}${adj.volumeDelta ? `${adj.volumeDelta > 0 ? '+' : ''}${adj.volumeDelta} accessory set(s)` : ''}</button></div>` : ''}${m.applied ? '<div class="small muted" style="margin-top:6px">✓ Applied to your plan</div>' : ''}</div>`;
}

async function aiSend(text) {
  text = (text || '').trim();
  if (!text || ui.aiBusy) return;
  const pl = plan();
  const week = currentWeek(state.startDate);
  state.chat.push({ role: 'user', content: text });
  state.chat.push({ role: 'assistant', content: '' });
  ui.aiBusy = true;
  ui.abort = new AbortController();
  render();
  const idx = state.chat.length - 1;
  const bubble = () => document.querySelector(`[data-msg="${idx}"]`);
  const history = state.chat.slice(0, -1).slice(-10).map(({ role, content }) => ({ role, content }));
  const messages = [{ role: 'system', content: systemPrompt(buildContext(state, pl, week)) }, ...history];
  const settings = {
    ...state.ai,
    onProgress: (p, t) => { ui.aiStatus = `Loading model ${Math.round(p * 100)}% — ${t}`; const s = document.getElementById('ai-status'); if (s) s.textContent = ui.aiStatus; },
  };
  try {
    await chat(settings, messages, (_d, full) => {
      state.chat[idx].content = full;
      const b = bubble();
      if (b) { b.textContent = full.replace(/ADJUST\s*\{[^}]*\}/, '').trim(); b.scrollIntoView({ block: 'end' }); }
    }, ui.abort.signal);
    ui.aiStatus = '';
  } catch (e) {
    if (e.name !== 'AbortError') state.chat[idx].content = `⚠️ ${e.message || e}`;
  } finally {
    ui.aiBusy = false;
    ui.abort = null;
    if (!state.chat[idx].content) state.chat.splice(idx, 1);
    state.chat = state.chat.slice(-40);
    persist();
    if (ui.tab === 'coach') render();
  }
}

// ---------- SETTINGS
function renderSettings() {
  const p = state.profile;
  setTop('Settings', 'Your data never leaves this phone');
  $view.innerHTML = `
    <div class="card">
      <h2>Profile</h2>
      <p class="small muted" style="margin:0 0 10px">${esc(GOALS[p.goal])} · ${p.days} days · ${p.minutes} min · ${({ gym: 'Full gym', db: 'Dumbbells', bw: 'Bodyweight' })[p.equipment]} · ${p.experience}</p>
      <button class="btn block" data-action="edit-profile">Edit goals, schedule & equipment</button>
    </div>
    <div class="card stack">
      <h2>Units</h2>${seg('units-live', [['kg', 'kg'], ['lb', 'lb']], p.units)}
    </div>
    <div class="card stack">
      <h2>Backup</h2>
      <p class="small muted" style="margin:0">Export a backup file now and then (or before changing phones). Your API key is never included.</p>
      <div class="grid2"><button class="btn" data-action="export">Export backup</button><label class="btn" style="margin:0">Import backup<input type="file" accept="application/json,.json" data-action-change="import" hidden></label></div>
    </div>
    <div class="card stack">
      <h2>Exercise swaps</h2>
      <p class="small muted" style="margin:0">${Object.keys(state.adjustments.swaps || {}).length} manual swap(s). Swap exercises from the Today tab.</p>
      <button class="btn" data-action="reset-swaps">Reset all swaps</button>
    </div>
    <div class="card stack">
      <h2>Danger zone</h2>
      <button class="btn danger" data-action="reset-all">Delete all data</button>
    </div>
    <p class="small muted" style="text-align:center">GymCoach AI · free & open source · not medical advice.<br>Talk to a doctor before starting if you have a health condition.</p>`;
}

async function exportBackup() {
  const json = exportJson(state);
  const name = `gymcoach-backup-${todayIso()}.json`;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'GymCoach backup' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- sheet
function showSheet(html) {
  closeSheet();
  const bd = document.createElement('div');
  bd.className = 'sheet-backdrop';
  bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  document.body.appendChild(bd);
}
function closeSheet() { document.querySelector('.sheet-backdrop')?.remove(); }

// ---------- events
function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = val;
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action],[data-set],[data-toggle],[data-ci-set],[data-ci-toggle],[data-tab]');
  if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; if (ui.tab !== 'today') ui.week = null; render(); window.scrollTo(0, 0); return; }

  if (t.dataset.set) {
    const key = t.dataset.set;
    const v = t.dataset.val;
    const num = /^\d+$/.test(v) ? Number(v) : v;
    if (ui.wizard && !key.startsWith('ai.') && key !== 'rpe' && key !== 'units-live') { setPath(ui.wizard, key, num); render(); return; }
    if (key === 'rpe') { draftFor().rpe = num; persist(); render(); return; }
    if (key === 'ai.mode') { state.ai.mode = v; persist(); render(); return; }
    if (key === 'units-live') { state.profile.units = v; persist(); render(); return; }
    return;
  }
  if (t.dataset.toggle) {
    const arr = ui.wizard[t.dataset.toggle];
    const v = t.dataset.val;
    ui.wizard[t.dataset.toggle] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    render(); return;
  }
  if (t.dataset.ciSet) { ui.ci[t.dataset.ciSet] = Number(t.dataset.val); render(); return; }
  if (t.dataset.ciToggle) { const v = t.dataset.ciToggle; ui.ci.pain = ui.ci.pain.includes(v) ? ui.ci.pain.filter((x) => x !== v) : [...ui.ci.pain, v]; render(); return; }

  const a = t.dataset.action;
  switch (a) {
    case 'wiz-next': wizardNext(); break;
    case 'wiz-back': ui.step = Math.max(0, ui.step - 1); render(); break;
    case 'wiz-cancel': ui.wizard = null; ui.step = 0; render(); break;
    case 'edit-profile': ui.wizard = draftFromProfile(state.profile); ui.step = 0; render(); window.scrollTo(0, 0); break;
    case 'pick-day': ui.day = Number(t.dataset.i); render(); break;
    case 'week-prev': ui.week = Math.max(1, (ui.week ?? currentWeek(state.startDate)) - 1); ui.day = null; render(); break;
    case 'week-next': ui.week = Math.min(WEEKS, (ui.week ?? currentWeek(state.startDate)) + 1); ui.day = null; render(); break;
    case 'week-now': ui.week = null; ui.day = null; render(); break;
    case 'tick': {
      const d = draftFor();
      const sets = (d.sets[t.dataset.ex] ||= []);
      const s = (sets[Number(t.dataset.si)] ||= {});
      s.done = !s.done;
      t.setAttribute('aria-pressed', String(s.done));
      persist();
      if (s.done) startTimer(Number(t.dataset.rest));
      break;
    }
    case 'timer-add': if (ui.timer) ui.timer.end += 30000; renderTimer(); break;
    case 'timer-stop': stopTimer(); break;
    case 'finish': finishWorkout(); break;
    case 'swap': {
      const opts = swapOptions(t.dataset.pattern, state.profile.equipment);
      const cur = state.adjustments.swaps[t.dataset.slot];
      showSheet(`<h2>Swap · ${esc(PATTERN_LABEL[t.dataset.pattern])}</h2><p class="small muted">Applies to this slot in every week.</p>
        ${opts.map((o) => `<button class="choice" data-action="do-swap" data-slot="${esc(t.dataset.slot)}" data-id="${o.id}" aria-pressed="${o.id === cur}"><strong>${esc(o.name)}</strong><span>${esc(o.cue)}</span></button>`).join('')}
        <button class="btn block" data-action="do-swap" data-slot="${esc(t.dataset.slot)}" data-id="">Use the coach’s pick</button>`);
      break;
    }
    case 'do-swap': {
      if (t.dataset.id) state.adjustments.swaps[t.dataset.slot] = t.dataset.id;
      else delete state.adjustments.swaps[t.dataset.slot];
      persist(); closeSheet(); render(); break;
    }
    case 'close-sheet': closeSheet(); break;
    case 'goto-checkin': closeSheet(); ui.tab = 'log'; ui.logView = 'checkin'; render(); window.scrollTo(0, 0); break;
    case 'open-settings': ui.prevTab = ui.tab; ui.tab = 'settings'; render(); window.scrollTo(0, 0); break;
    case 'close-settings': ui.tab = ui.prevTab || 'today'; render(); break;
    case 'log-view': ui.logView = t.dataset.v; render(); break;
    case 'ex-info': exInfoSheet(t.dataset.id); break;
    case 'ex-history': exHistorySheet(t.dataset.id); break;
    case 'guide-pat': ui.guidePat = t.dataset.p; render(); break;
    case 'free-log':
      showSheet(`<div class="row spread"><h2 style="margin:0">Log an exercise</h2><button class="linkbtn" data-action="close-sheet">Cancel</button></div>
        <input class="input" type="search" id="free-q" placeholder="Search e.g. curl, press, squat…" style="margin:10px 0">
        <div id="free-list">${freePickerHtml()}</div>`);
      break;
    case 'free-pick': ui.free = { id: t.dataset.id, sets: [{ w: '', r: '' }, { w: '', r: '' }, { w: '', r: '' }] }; freeSetsSheet(); break;
    case 'free-add-set': ui.free.sets.push({ ...(ui.free.sets.at(-1) || { w: '', r: '' }) }); freeSetsSheet(); break;
    case 'free-save': saveFree(); break;
    case 'submit-checkin': submitCheckIn(); break;
    case 'del-log':
      if (confirm('Delete this workout log?')) {
        state.logs = state.logs.filter((l) => !(l.date === t.dataset.date && l.week === Number(t.dataset.week) && l.dayIndex === Number(t.dataset.day)));
        persist(); render();
      }
      break;
    case 'new-cycle':
      if (confirm('Start a new 12-week cycle from today? Your history and learned weights are kept.')) {
        if (state.adjustments.currentWeightKg) state.profile.weightKg = state.adjustments.currentWeightKg;
        state.startDate = todayIso();
        state.adjustments = { ...defaultAdjustments(), swaps: state.adjustments.swaps };
        state.logs = state.logs.map((l) => ({ ...l, week: l.week - 100 })); // archive: keep history out of the new cycle's weeks
        state.checkIns = [];
        addEvent('New 12-week cycle started.');
        persist(); render();
      }
      break;
    case 'ai-send': { const i = document.getElementById('ai-input'); const v = i.value; i.value = ''; aiSend(v); break; }
    case 'ai-quick': aiSend(t.dataset.q); break;
    case 'ai-stop': ui.abort?.abort(); break;
    case 'ai-clear': state.chat = []; persist(); render(); break;
    case 'ai-apply': {
      const m = state.chat[Number(t.dataset.i)];
      const adj = parseAdjust(m.content);
      if (adj) {
        state.adjustments.calorieDelta = Math.max(-600, Math.min(600, (state.adjustments.calorieDelta || 0) + adj.calorieDelta));
        state.adjustments.volumeBase = Math.max(-2, Math.min(2, (state.adjustments.volumeBase || 0) + adj.volumeDelta));
        m.applied = true;
        addEvent(`AI coach suggestion applied: ${adj.calorieDelta ? `${adj.calorieDelta} kcal/day ` : ''}${adj.volumeDelta ? `${adj.volumeDelta} accessory sets` : ''}`.trim(), 'ai');
        persist(); render(); toast('Plan updated');
      }
      break;
    }
    case 'ai-load': {
      ui.aiStatus = 'Starting…'; render();
      try {
        await loadLocalModel(state.ai.localModel, (p, txt) => { ui.aiStatus = `${Math.round(p * 100)}% — ${txt}`; const s = document.getElementById('ai-status'); if (s) s.textContent = ui.aiStatus; });
        ui.aiStatus = '✅ Model ready. It’s cached on your phone for offline use.';
      } catch (err) { ui.aiStatus = `⚠️ ${err.message || err}`; }
      if (ui.tab === 'coach') render();
      break;
    }
    case 'ai-delete':
      try { await deleteLocalModel(state.ai.localModel); ui.aiStatus = 'Model deleted from this phone.'; } catch (err) { ui.aiStatus = `⚠️ ${err.message || err}`; }
      render(); break;
    case 'ai-preset': {
      const P = {
        groq: ['https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
        openrouter: ['https://openrouter.ai/api/v1', 'meta-llama/llama-3.3-70b-instruct:free'],
        ollama: ['https://YOUR-TUNNEL-URL/v1', 'llama3.2'],
      }[t.dataset.p];
      state.ai.baseUrl = P[0]; state.ai.remoteModel = P[1]; persist(); render(); break;
    }
    case 'export': exportBackup(); break;
    case 'reset-swaps': state.adjustments.swaps = {}; persist(); toast('Swaps reset'); render(); break;
    case 'reset-all':
      if (confirm('Delete ALL data (profile, plan, logs)? This cannot be undone.')) { state = emptyState(); persist(); ui.tab = 'today'; render(); }
      break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.bind && ui.wizard) { setPath(ui.wizard, t.dataset.bind, t.type === 'checkbox' ? t.checked : t.value); return; }
  if (t.dataset.setW || t.dataset.setR) {
    const d = draftFor();
    const id = t.dataset.setW || t.dataset.setR;
    const sets = (d.sets[id] ||= []);
    const s = (sets[Number(t.dataset.si)] ||= {});
    if (t.dataset.setW) s.w = t.value; else s.r = t.value;
    persist();
    return;
  }
  if (t.dataset.draft) { draftFor()[t.dataset.draft] = t.value; persist(); return; }
  if (t.dataset.ci) { ui.ci[t.dataset.ci] = t.dataset.ci === 'week' ? Number(t.value) : t.value; return; }
  if (t.dataset.ai) { state.ai[t.dataset.ai] = t.value; persist(); return; }
  if (t.id === 'guide-q') { ui.guideQ = t.value; const el = document.getElementById('lib-list'); el.innerHTML = libraryHtml(); startDemos(el); return; }
  if (t.id === 'free-q') { document.getElementById('free-list').innerHTML = freePickerHtml(t.value); return; }
  if (t.dataset.freeW != null) { ui.free.sets[Number(t.dataset.freeW)].w = t.value; return; }
  if (t.dataset.freeR != null) { ui.free.sets[Number(t.dataset.freeR)].r = t.value; }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.ci === 'week') { ui.ci.week = Number(t.value); return; }
  if (t.dataset.ai === 'localModel') {
    state.ai.localModel = t.value; persist();
    ui.aiStatus = (await isModelCached(t.value)) ? 'Downloaded ✓ — ready offline.' : 'Not downloaded yet.';
    render(); return;
  }
  if (t.dataset.actionChange === 'chart-ex') { ui.chartEx = t.value; render(); return; }
  if (t.dataset.actionChange === 'import' && t.files?.[0]) {
    try {
      const next = importJson(await t.files[0].text());
      if (confirm('Replace all current data with this backup?')) { next.ai.apiKey = state.ai.apiKey; state = next; persist(); toast('Backup restored'); render(); }
    } catch (err) { toast(`Import failed: ${err.message}`); }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.id === 'ai-input' && e.key === 'Enter' && !e.shiftKey && !/iPhone|iPad/.test(navigator.userAgent)) {
    e.preventDefault(); const v = e.target.value; e.target.value = ''; aiSend(v);
  }
});

// ---------- boot
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
render();
