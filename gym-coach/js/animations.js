// Offline exercise demonstrations: a stick figure animated between a start and end pose.
// Poses are authored as joint targets (hip, feet, hands) and solved with 2-bone IK so limb lengths stay constant.
// ViewBox 0 -12 120 122 (headroom for overhead lifts), ground at y = 100, figure faces right.

const L = { thigh: 24, shin: 24, torso: 28, uarm: 16, farm: 15, neck: 11 };
const GROUND = 100;

const dir = (deg) => {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

/** Two-bone IK: joint position between root and target. bend = +1 / -1 picks the side the joint bends to. */
function ik(root, target, l1, l2, bend) {
  let dx = target[0] - root[0];
  let dy = target[1] - root[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const ux = dx / d, uy = dy / d;
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const nx = -uy * bend, ny = ux * bend;
  const joint = [root[0] + l1 * (ux * cosA + nx * sinA), root[1] + l1 * (uy * cosA + ny * sinA)];
  const end = [root[0] + dx, root[1] + dy];
  return { joint, end };
}

// kb: knee bend side, eb: elbow bend side (+1/-1). front: front-facing view with two symmetric arms/legs.
// Props: bar (barbell end-on at hands), db (dumbbells), bench:[x1,x2,y], seat:[x1,x2,y], pullbar, cable:[x,y], mat
export const POSES = {
  squat: {
    props: { bar: 1 },
    a: { hip: [58, 52], torso: 0, foot: [60, 100], handRel: [-8, 4] },
    b: { hip: [42, 74], torso: 38, foot: [60, 100], handRel: [-8, 4] },
  },
  hinge: {
    props: { bar: 1 },
    a: { hip: [58, 52], torso: 0, foot: [60, 100], handRel: [1, 30] },
    b: { hip: [42, 62], torso: 72, foot: [60, 100], handRel: [0, 30] },
  },
  lunge: {
    props: { db: 1 },
    a: { hip: [57, 54], torso: 0, foot: [70, 100], foot2: [42, 100], handRel: [1, 30] },
    b: { hip: [56, 76], torso: 4, foot: [70, 100], foot2: [42, 100], handRel: [1, 30] },
  },
  quad: {
    props: { seat: [30, 58, 74] },
    a: { hip: [50, 70], torso: -12, foot: [74, 94], handRel: [8, 24] },
    b: { hip: [50, 70], torso: -12, foot: [97, 68], handRel: [8, 24] },
  },
  ham: {
    props: { seat: [30, 58, 74] },
    a: { hip: [50, 70], torso: -12, foot: [97, 68], handRel: [8, 24] },
    b: { hip: [50, 70], torso: -12, foot: [66, 92], handRel: [8, 24] },
  },
  hpush: {
    props: { bar: 1, bench: [26, 82, 76] },
    a: { hip: [42, 72], torso: 90, foot: [22, 100], hand: [69, 42], kb: -1 },
    b: { hip: [42, 72], torso: 90, foot: [22, 100], hand: [66, 64], kb: -1, eb: -1 },
  },
  vpush: {
    props: { bar: 1 },
    a: { hip: [60, 52], torso: 0, foot: [60, 100], handRel: [11, 0] },
    b: { hip: [60, 52], torso: 0, foot: [60, 100], handRel: [2, -30] },
  },
  hpull: {
    props: { bar: 1 },
    a: { hip: [44, 60], torso: 62, foot: [60, 100], handRel: [0, 30] },
    b: { hip: [44, 60], torso: 62, foot: [60, 100], handRel: [-7, 13] },
  },
  vpull: {
    props: { pullbar: 1 }, noGround: true,
    a: { hip: [60, 66], torso: 0, foot: [50, 104], hand: [62, 6] },
    b: { hip: [60, 46], torso: 0, foot: [50, 84], hand: [62, 6], eb: -1 },
  },
  chest_iso: {
    props: { db: 1, bench: [26, 82, 76] },
    a: { hip: [42, 72], torso: 90, foot: [22, 100], hand: [69, 42], kb: -1 },
    b: { hip: [42, 72], torso: 90, foot: [22, 100], hand: [84, 70], kb: -1 },
  },
  delt_side: {
    props: { db: 1 }, front: true,
    a: { hip: [60, 52], torso: 0, foot: [54, 100], foot2: [66, 100], hand: [47, 58], hand2: [73, 58] },
    b: { hip: [60, 52], torso: 0, foot: [54, 100], foot2: [66, 100], hand: [23, 27], hand2: [97, 27] },
  },
  delt_rear: {
    props: { db: 1 },
    a: { hip: [42, 62], torso: 72, foot: [60, 100], handRel: [0, 30] },
    b: { hip: [42, 62], torso: 72, foot: [60, 100], handRel: [-3, 3], eb: 1 },
  },
  biceps: {
    props: { db: 1 },
    a: { hip: [60, 52], torso: 0, foot: [60, 100], handRel: [3, 30] },
    b: { hip: [60, 52], torso: 0, foot: [60, 100], handRel: [8, 1], eb: 1 },
  },
  triceps: {
    props: { cable: [84, 4] },
    a: { hip: [60, 52], torso: 4, foot: [60, 100], handRel: [13, 6], eb: 1 },
    b: { hip: [60, 52], torso: 4, foot: [60, 100], handRel: [4, 30], eb: 1 },
  },
  calves: {
    props: { db: 1 },
    a: { hip: [60, 52], torso: 0, foot: [60, 100], handRel: [1, 30] },
    b: { hip: [60, 45], torso: 0, foot: [60, 93], handRel: [1, 30] },
  },
  glute: {
    props: { bench: [10, 34, 76], bar: 1 },
    a: { hip: [54, 88], shoulder: [32, 72], foot: [76, 100], handHip: [0, -2], kb: -1 },
    b: { hip: [58, 72], shoulder: [30, 70], foot: [76, 100], handHip: [0, -2], kb: -1 },
  },
  core: {
    props: { mat: 1 },
    a: { hip: [50, 93], torso: 90, foot: [28, 72], hand: [78, 64], kb: -1 },
    b: { hip: [50, 93], torso: 90, foot: [6, 90], hand: [104, 86], kb: -1 },
  },
};

function lerp(a, b, t) {
  if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * t);
  if (typeof a === 'number') return a + (b - a) * t;
  return t < 0.5 ? a : b;
}
function mix(pa, pb, t) {
  const o = {};
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) o[k] = lerp(pa[k] ?? pb[k], pb[k] ?? pa[k], t);
  return o;
}

/** Solve a pose into drawable segments. */
export function solve(p, front = false) {
  const hip = p.hip;
  let shoulder;
  if (p.shoulder) shoulder = p.shoulder;
  else shoulder = add(hip, dir(p.torso || 0), L.torso);
  const torsoDir = [(shoulder[0] - hip[0]) / L.torso, (shoulder[1] - hip[1]) / L.torso];
  const head = front ? [shoulder[0], shoulder[1] - L.neck] : add(shoulder, torsoDir, L.neck);
  const kb = p.kb ?? 1;
  const eb = p.eb ?? -1;
  const hipL = front ? [hip[0] - 5, hip[1]] : hip;
  const hipR = front ? [hip[0] + 5, hip[1]] : hip;
  const shL = front ? [shoulder[0] - 9, shoulder[1] + 2] : shoulder;
  const shR = front ? [shoulder[0] + 9, shoulder[1] + 2] : shoulder;

  const leg1 = ik(hipL, p.foot, L.thigh, L.shin, front ? -1 : -kb);
  const leg2 = p.foot2 ? ik(hipR, p.foot2, L.thigh, L.shin, front ? 1 : -kb) : null;
  let hand = p.hand;
  if (p.handRel) hand = add(shoulder, p.handRel);
  if (p.handHip) hand = add(hip, p.handHip);
  const arm1 = ik(shL, hand, L.uarm, L.farm, front ? 1 : eb);
  const arm2 = p.hand2 ? ik(shR, p.hand2, L.uarm, L.farm, -1) : null;
  return { hip, shoulder, head, hipL, hipR, shL, shR, leg1, leg2, arm1, arm2 };
}

const toe = (ankle, flip = false) => {
  const raised = ankle[1] < GROUND - 1;
  return [ankle[0] + (flip ? -9 : 9), raised ? Math.min(GROUND, ankle[1] + 7) : ankle[1]];
};

function draw(svg, def, s) {
  const seg = (a, b, cls = 'limb') => `<line class="${cls}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
  const pr = def.props || {};
  let g = '';
  if (!def.noGround) g += `<line class="ground" x1="4" y1="${GROUND + 1.5}" x2="116" y2="${GROUND + 1.5}"/>`;
  if (pr.mat) g += `<rect class="prop" x="0" y="${GROUND - 2}" width="120" height="3" rx="1.5"/>`;
  if (pr.bench) g += `<rect class="prop" x="${pr.bench[0]}" y="${pr.bench[2]}" width="${pr.bench[1] - pr.bench[0]}" height="5" rx="2"/><line class="prop-l" x1="${pr.bench[0] + 6}" y1="${pr.bench[2] + 5}" x2="${pr.bench[0] + 6}" y2="${GROUND}"/><line class="prop-l" x1="${pr.bench[1] - 6}" y1="${pr.bench[2] + 5}" x2="${pr.bench[1] - 6}" y2="${GROUND}"/>`;
  if (pr.seat) g += `<rect class="prop" x="${pr.seat[0]}" y="${pr.seat[2]}" width="${pr.seat[1] - pr.seat[0]}" height="5" rx="2"/><line class="prop-l" x1="${(pr.seat[0] + pr.seat[1]) / 2}" y1="${pr.seat[2] + 5}" x2="${(pr.seat[0] + pr.seat[1]) / 2}" y2="${GROUND}"/><rect class="prop" x="${pr.seat[0] - 4}" y="${pr.seat[2] - 30}" width="5" height="32" rx="2"/>`;
  if (pr.pullbar) g += `<line class="prop-l" x1="30" y1="6" x2="94" y2="6"/>`;
  const hand = s.arm1.end;
  if (pr.cable) g += `<line class="cable" x1="${pr.cable[0]}" y1="${pr.cable[1]}" x2="${hand[0].toFixed(1)}" y2="${hand[1].toFixed(1)}"/>`;

  // far-side limbs first (lighter), then torso/head, then near-side limbs
  if (s.leg2) g += seg(s.hipR, s.leg2.joint, 'limb far') + seg(s.leg2.joint, s.leg2.end, 'limb far') + seg(s.leg2.end, toe(s.leg2.end, def.front), 'limb far foot');
  if (s.arm2 && !def.front) g += seg(s.shR, s.arm2.joint, 'limb far') + seg(s.arm2.joint, s.arm2.end, 'limb far');
  g += seg(s.hip, s.shoulder, 'limb torso');
  if (def.front) g += seg(s.hipL, s.hipR, 'limb torso') + seg(s.shL, s.shR, 'limb torso');
  g += `<circle class="head" cx="${s.head[0].toFixed(1)}" cy="${s.head[1].toFixed(1)}" r="6.5"/>`;
  g += seg(s.hipL, s.leg1.joint) + seg(s.leg1.joint, s.leg1.end) + seg(s.leg1.end, toe(s.leg1.end, def.front && true), 'limb foot');
  g += seg(s.shL, s.arm1.joint) + seg(s.arm1.joint, s.arm1.end);
  if (s.arm2 && def.front) g += seg(s.shR, s.arm2.joint) + seg(s.arm2.joint, s.arm2.end);

  const hands = [s.arm1.end, ...(s.arm2 && def.front ? [s.arm2.end] : [])];
  for (const h of hands) {
    if (pr.bar) g += `<circle class="plate" cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="8"/><circle class="hub" cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="2"/>`;
    else if (pr.db) g += `<circle class="plate" cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="3.6"/>`;
  }
  svg.innerHTML = g;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const running = new Map();
let rafId = null;

function tick(now) {
  for (const [svg, st] of running) {
    if (!svg.isConnected) { running.delete(svg); continue; }
    if (!st.visible) continue;
    // 1.2s down (eccentric), 0.3s hold, 0.9s up, 0.4s hold
    const T = 2800;
    const t = ((now - st.t0) % T) / T;
    let k;
    if (t < 0.43) k = ease(t / 0.43);
    else if (t < 0.54) k = 1;
    else if (t < 0.86) k = 1 - ease((t - 0.54) / 0.32);
    else k = 0;
    draw(svg, st.def, solve(mix(st.def.a, st.def.b, k), st.def.front));
  }
  rafId = running.size ? requestAnimationFrame(tick) : null;
}

const io = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entries) => { for (const e of entries) { const st = running.get(e.target); if (st) st.visible = e.isIntersecting; } })
  : null;

/** Returns SVG markup for a demo; call startDemos(container) after inserting it into the DOM. */
export function demoSvg(pattern, label = '') {
  return `<svg class="demo" viewBox="0 -12 120 122" data-demo="${pattern}" role="img" aria-label="${label ? `${label} — ` : ''}animated demonstration"></svg>`;
}

export function startDemos(root = document) {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const svg of root.querySelectorAll('svg[data-demo]')) {
    const def = POSES[svg.dataset.demo];
    if (!def || running.has(svg)) continue;
    if (reduce) { draw(svg, def, solve(def.b, def.front)); continue; }
    draw(svg, def, solve(def.a, def.front));
    running.set(svg, { def, t0: performance.now(), visible: !io });
    io?.observe(svg);
  }
  if (running.size && !rafId) rafId = requestAnimationFrame(tick);
}

/** Draw one static pose ('a' = start, 'b' = end). */
export function renderPose(svg, pattern, phase = 'b') {
  const def = POSES[pattern];
  if (def) draw(svg, def, solve(def[phase], def.front));
}
