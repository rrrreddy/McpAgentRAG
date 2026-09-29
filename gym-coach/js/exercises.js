// Exercise library. Pure data + selection helpers (no DOM) so it can be unit-tested in Node.
//
// equip: minimum equipment level needed — 'bw' (bodyweight/home), 'db' (dumbbells + bench), 'gym' (full gym).
// tier:  1 = main compound, 2 = secondary compound, 3 = isolation/accessory.
// load:  'bar' | 'db' (weight per hand) | 'machine' | 'bw' (bodyweight — progress with reps).
// base:  optional [lift, ratio] — estimates a starting load from the user's baseline lift.
// avoid: injury flags this exercise is not suggested for.
// inc:   smallest sensible load jump in kg.

export const EQUIP_RANK = { bw: 0, db: 1, gym: 2 };

export const EXERCISES = [
  // ---- squat pattern
  { id: 'back_squat', name: 'Barbell Back Squat', pattern: 'squat', equip: 'gym', tier: 1, load: 'bar', base: ['squat', 1], inc: 2.5, avoid: ['knee', 'lower_back'], cue: 'Brace hard, sit between the hips, knees track over toes.' },
  { id: 'front_squat', name: 'Front Squat', pattern: 'squat', equip: 'gym', tier: 1, load: 'bar', base: ['squat', 0.8], inc: 2.5, avoid: ['knee', 'shoulder'], cue: 'Elbows high, torso upright.' },
  { id: 'leg_press', name: 'Leg Press', pattern: 'squat', equip: 'gym', tier: 2, load: 'machine', base: ['squat', 1.6], inc: 5, avoid: [], cue: 'Controlled depth, lower back stays on the pad.' },
  { id: 'hack_squat', name: 'Hack Squat (machine)', pattern: 'squat', equip: 'gym', tier: 2, load: 'machine', base: ['squat', 0.9], inc: 5, avoid: ['knee'], cue: 'Full foot pressure, slow lowering.' },
  { id: 'goblet_squat', name: 'Goblet Squat', pattern: 'squat', equip: 'db', tier: 2, load: 'db', base: ['squat', 0.35], inc: 2, avoid: [], cue: 'Hold the dumbbell at the chest, sit down between the knees.' },
  { id: 'box_squat_bw', name: 'Box / Chair Squat', pattern: 'squat', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Touch the box lightly, stand up tall. Add a backpack when easy.' },
  { id: 'bw_squat', name: 'Tempo Bodyweight Squat (3s down)', pattern: 'squat', equip: 'bw', tier: 2, load: 'bw', avoid: ['knee'], cue: '3 seconds down, pause, drive up.' },

  // ---- hinge pattern
  { id: 'deadlift', name: 'Conventional Deadlift', pattern: 'hinge', equip: 'gym', tier: 1, load: 'bar', base: ['deadlift', 1], inc: 2.5, avoid: ['lower_back'], cue: 'Bar over mid-foot, lats tight, push the floor away.' },
  { id: 'trap_bar_dl', name: 'Trap-Bar Deadlift', pattern: 'hinge', equip: 'gym', tier: 1, load: 'bar', base: ['deadlift', 1.05], inc: 2.5, avoid: [], cue: 'Neutral spine, stand up through the whole foot.' },
  { id: 'rdl', name: 'Romanian Deadlift', pattern: 'hinge', equip: 'gym', tier: 2, load: 'bar', base: ['deadlift', 0.6], inc: 2.5, avoid: ['lower_back'], cue: 'Soft knees, hips back until a hamstring stretch.' },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', pattern: 'hinge', equip: 'db', tier: 2, load: 'db', base: ['deadlift', 0.25], inc: 2, avoid: [], cue: 'Dumbbells slide down the thighs, flat back.' },
  { id: 'hip_thrust', name: 'Barbell Hip Thrust', pattern: 'hinge', equip: 'gym', tier: 2, load: 'bar', base: ['deadlift', 0.8], inc: 5, avoid: [], cue: 'Chin tucked, squeeze glutes at the top.' },
  { id: 'sl_rdl_bw', name: 'Single-Leg RDL (bodyweight)', pattern: 'hinge', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Reach long, hips square. Hold a wall if needed.' },
  { id: 'glute_bridge', name: 'Glute Bridge', pattern: 'hinge', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Drive through heels, pause 1s at the top.' },

  // ---- single-leg
  { id: 'bulgarian', name: 'Bulgarian Split Squat', pattern: 'lunge', equip: 'db', tier: 2, load: 'db', base: ['squat', 0.2], inc: 2, avoid: ['knee'], cue: 'Rear foot on bench, front shin fairly vertical.' },
  { id: 'walking_lunge', name: 'Walking Lunge', pattern: 'lunge', equip: 'db', tier: 2, load: 'db', base: ['squat', 0.18], inc: 2, avoid: ['knee'], cue: 'Long steps, back knee kisses the floor.' },
  { id: 'step_up', name: 'Step-Up', pattern: 'lunge', equip: 'db', tier: 2, load: 'db', base: ['squat', 0.15], inc: 2, avoid: [], cue: 'Drive through the top leg, no push from the bottom foot.' },
  { id: 'reverse_lunge_bw', name: 'Reverse Lunge', pattern: 'lunge', equip: 'bw', tier: 2, load: 'bw', avoid: ['knee'], cue: 'Step back, keep weight on the front foot.' },
  { id: 'split_squat_bw', name: 'Split Squat (bodyweight)', pattern: 'lunge', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Stay tall, slow lowering.' },

  // ---- knee extension / quads
  { id: 'leg_ext', name: 'Leg Extension', pattern: 'quad', equip: 'gym', tier: 3, load: 'machine', inc: 5, avoid: ['knee'], cue: 'Pause at the top, slow down.' },
  { id: 'spanish_squat', name: 'Wall Sit', pattern: 'quad', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Thighs parallel, hold for time (reps = seconds ÷ 5).' },
  { id: 'heel_elev_goblet', name: 'Heels-Elevated Goblet Squat', pattern: 'quad', equip: 'db', tier: 3, load: 'db', inc: 2, avoid: ['knee'], cue: 'Heels on a plate, upright torso, deep knees.' },

  // ---- knee flexion / hamstrings
  { id: 'leg_curl', name: 'Seated / Lying Leg Curl', pattern: 'ham', equip: 'gym', tier: 3, load: 'machine', inc: 5, avoid: [], cue: 'Hips pinned, slow eccentric.' },
  { id: 'db_leg_curl', name: 'Dumbbell Leg Curl', pattern: 'ham', equip: 'db', tier: 3, load: 'db', inc: 2, avoid: [], cue: 'Dumbbell between the feet, lying face down.' },
  { id: 'slider_curl', name: 'Slider / Towel Hamstring Curl', pattern: 'ham', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Hips up, slide heels in and out slowly.' },

  // ---- horizontal push
  { id: 'bench', name: 'Barbell Bench Press', pattern: 'hpush', equip: 'gym', tier: 1, load: 'bar', base: ['bench', 1], inc: 2.5, avoid: ['shoulder'], cue: 'Shoulder blades pinned, bar to lower chest.' },
  { id: 'db_bench', name: 'Dumbbell Bench Press', pattern: 'hpush', equip: 'db', tier: 1, load: 'db', base: ['bench', 0.38], inc: 2, avoid: [], cue: 'Elbows ~45°, full stretch at the bottom.' },
  { id: 'incline_db', name: 'Incline Dumbbell Press', pattern: 'hpush', equip: 'db', tier: 2, load: 'db', base: ['bench', 0.32], inc: 2, avoid: [], cue: '30° bench, press slightly back over the shoulders.' },
  { id: 'incline_bench', name: 'Incline Barbell Bench', pattern: 'hpush', equip: 'gym', tier: 2, load: 'bar', base: ['bench', 0.8], inc: 2.5, avoid: ['shoulder'], cue: 'Bar to upper chest, wrists stacked.' },
  { id: 'machine_press', name: 'Machine Chest Press', pattern: 'hpush', equip: 'gym', tier: 2, load: 'machine', base: ['bench', 0.9], inc: 5, avoid: [], cue: 'Controlled, stop just short of lockout.' },
  { id: 'pushup', name: 'Push-Up', pattern: 'hpush', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Body in a straight line. Elevate hands to make easier, feet to make harder.' },
  { id: 'deficit_pushup', name: 'Deficit / Feet-Elevated Push-Up', pattern: 'hpush', equip: 'bw', tier: 2, load: 'bw', avoid: ['shoulder'], cue: 'Hands on books for extra depth.' },

  // ---- vertical push
  { id: 'ohp', name: 'Standing Overhead Press', pattern: 'vpush', equip: 'gym', tier: 1, load: 'bar', base: ['ohp', 1], inc: 2.5, avoid: ['shoulder', 'lower_back'], cue: 'Squeeze glutes, head through at the top.' },
  { id: 'db_shoulder_press', name: 'Seated Dumbbell Shoulder Press', pattern: 'vpush', equip: 'db', tier: 2, load: 'db', base: ['ohp', 0.4], inc: 2, avoid: [], cue: 'Slight incline back rest, don\'t flare elbows fully.' },
  { id: 'landmine_press', name: 'Landmine Press', pattern: 'vpush', equip: 'gym', tier: 2, load: 'bar', base: ['ohp', 0.6], inc: 2.5, avoid: [], cue: 'Shoulder-friendly press path.' },
  { id: 'pike_pushup', name: 'Pike Push-Up', pattern: 'vpush', equip: 'bw', tier: 2, load: 'bw', avoid: ['shoulder'], cue: 'Hips high, head moves forward of the hands.' },

  // ---- horizontal pull
  { id: 'bb_row', name: 'Barbell Row', pattern: 'hpull', equip: 'gym', tier: 1, load: 'bar', base: ['row', 1], inc: 2.5, avoid: ['lower_back'], cue: 'Hinge to ~45°, pull to the belly button.' },
  { id: 'cs_row', name: 'Chest-Supported Row', pattern: 'hpull', equip: 'db', tier: 2, load: 'db', base: ['row', 0.4], inc: 2, avoid: [], cue: 'Chest on incline bench, drive elbows back.' },
  { id: 'cable_row', name: 'Seated Cable Row', pattern: 'hpull', equip: 'gym', tier: 2, load: 'machine', base: ['row', 0.9], inc: 5, avoid: [], cue: 'Tall chest, pause with shoulder blades squeezed.' },
  { id: 'one_arm_row', name: 'One-Arm Dumbbell Row', pattern: 'hpull', equip: 'db', tier: 2, load: 'db', base: ['row', 0.45], inc: 2, avoid: [], cue: 'Pull the elbow toward the hip.' },
  { id: 'inverted_row', name: 'Inverted Row (table / bar)', pattern: 'hpull', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Rigid body, chest to the edge.' },
  { id: 'towel_row', name: 'Door-Frame Towel Row', pattern: 'hpull', equip: 'bw', tier: 2, load: 'bw', avoid: [], cue: 'Lean back further to make it harder.' },

  // ---- vertical pull
  { id: 'pullup', name: 'Pull-Up / Chin-Up', pattern: 'vpull', equip: 'bw', tier: 1, load: 'bw', avoid: ['shoulder'], cue: 'Full hang to chin over bar. Use a band or negatives if needed.' },
  { id: 'lat_pulldown', name: 'Lat Pulldown', pattern: 'vpull', equip: 'gym', tier: 2, load: 'machine', base: ['row', 0.8], inc: 5, avoid: [], cue: 'Pull elbows down to the ribs, chest up.' },
  { id: 'neutral_pulldown', name: 'Neutral-Grip Pulldown', pattern: 'vpull', equip: 'gym', tier: 2, load: 'machine', base: ['row', 0.8], inc: 5, avoid: [], cue: 'Shoulder-friendly grip, slow return.' },
  { id: 'db_pullover', name: 'Dumbbell Pullover', pattern: 'vpull', equip: 'db', tier: 3, load: 'db', inc: 2, avoid: ['shoulder'], cue: 'Slight elbow bend, stretch the lats.' },
  { id: 'band_pulldown', name: 'Band Pulldown / Towel Lat Pull', pattern: 'vpull', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Pull elbows into the sides and squeeze.' },

  // ---- chest isolation
  { id: 'cable_fly', name: 'Cable / Pec-Deck Fly', pattern: 'chest_iso', equip: 'gym', tier: 3, load: 'machine', inc: 2.5, avoid: [], cue: 'Hug a tree, stretch under control.' },
  { id: 'db_fly', name: 'Dumbbell Fly', pattern: 'chest_iso', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: ['shoulder'], cue: 'Soft elbows, stop at a comfortable stretch.' },
  { id: 'wide_pushup', name: 'Slow Wide Push-Up', pattern: 'chest_iso', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: '3s down, stretch the chest.' },

  // ---- delts
  { id: 'lateral_raise', name: 'Dumbbell Lateral Raise', pattern: 'delt_side', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: [], cue: 'Lead with elbows, stop at shoulder height.' },
  { id: 'cable_lateral', name: 'Cable Lateral Raise', pattern: 'delt_side', equip: 'gym', tier: 3, load: 'machine', inc: 1, avoid: [], cue: 'Constant tension, slow down.' },
  { id: 'band_lateral', name: 'Band / Bottle Lateral Raise', pattern: 'delt_side', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Water bottles or a band work fine.' },
  { id: 'rear_delt_fly', name: 'Rear-Delt Fly', pattern: 'delt_rear', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: [], cue: 'Chest on incline bench, sweep arms wide.' },
  { id: 'face_pull', name: 'Face Pull', pattern: 'delt_rear', equip: 'gym', tier: 3, load: 'machine', inc: 2.5, avoid: [], cue: 'Pull to the eyes, thumbs back.' },
  { id: 'prone_ytw', name: 'Prone Y-T-W Raises', pattern: 'delt_rear', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Lying face down, slow and strict.' },

  // ---- arms
  { id: 'db_curl', name: 'Dumbbell Curl', pattern: 'biceps', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: [], cue: 'No swinging, full stretch.' },
  { id: 'ez_curl', name: 'EZ-Bar Curl', pattern: 'biceps', equip: 'gym', tier: 3, load: 'bar', inc: 2.5, avoid: [], cue: 'Elbows stay by your sides.' },
  { id: 'hammer_curl', name: 'Hammer Curl', pattern: 'biceps', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: [], cue: 'Neutral grip, slow lowering.' },
  { id: 'towel_curl', name: 'Backpack / Towel Curl', pattern: 'biceps', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Load a backpack with books.' },
  { id: 'rope_pushdown', name: 'Rope Triceps Pushdown', pattern: 'triceps', equip: 'gym', tier: 3, load: 'machine', inc: 2.5, avoid: [], cue: 'Elbows pinned, spread the rope at the bottom.' },
  { id: 'oh_db_ext', name: 'Overhead Dumbbell Extension', pattern: 'triceps', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: ['shoulder'], cue: 'Deep stretch behind the head.' },
  { id: 'db_skullcrusher', name: 'Dumbbell Skull Crusher', pattern: 'triceps', equip: 'db', tier: 3, load: 'db', inc: 1, avoid: [], cue: 'Lower beside the head, elbows still.' },
  { id: 'bench_dip', name: 'Bench Dip / Close Push-Up', pattern: 'triceps', equip: 'bw', tier: 3, load: 'bw', avoid: ['shoulder'], cue: 'Stay close to the bench, elbows back.' },
  { id: 'diamond_pushup', name: 'Close-Grip Push-Up', pattern: 'triceps', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Hands under shoulders, elbows tucked.' },

  // ---- calves / glutes / core
  { id: 'calf_raise_machine', name: 'Standing Calf Raise', pattern: 'calves', equip: 'gym', tier: 3, load: 'machine', inc: 5, avoid: [], cue: '2s pause in the stretch.' },
  { id: 'sl_calf_raise', name: 'Single-Leg Calf Raise', pattern: 'calves', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'On a step, full range, hold a dumbbell when easy.' },
  { id: 'cable_kickback', name: 'Cable Glute Kickback', pattern: 'glute', equip: 'gym', tier: 3, load: 'machine', inc: 2.5, avoid: [], cue: 'Square hips, squeeze at the top.' },
  { id: 'db_hip_thrust', name: 'Dumbbell Hip Thrust', pattern: 'glute', equip: 'db', tier: 3, load: 'db', inc: 2, avoid: [], cue: 'Upper back on bench, dumbbell on hips.' },
  { id: 'sl_glute_bridge', name: 'Single-Leg Glute Bridge', pattern: 'glute', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Keep hips level.' },
  { id: 'plank', name: 'Plank', pattern: 'core', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Squeeze glutes, ribs down (reps = seconds ÷ 5).' },
  { id: 'dead_bug', name: 'Dead Bug', pattern: 'core', equip: 'bw', tier: 3, load: 'bw', avoid: [], cue: 'Low back pressed into the floor.' },
  { id: 'cable_crunch', name: 'Cable Crunch', pattern: 'core', equip: 'gym', tier: 3, load: 'machine', inc: 5, avoid: ['lower_back'], cue: 'Curl the ribs toward the hips.' },
  { id: 'hanging_knee', name: 'Hanging Knee Raise', pattern: 'core', equip: 'gym', tier: 3, load: 'bw', avoid: ['shoulder'], cue: 'No swinging, tilt the pelvis up.' },
  { id: 'pallof', name: 'Pallof Press', pattern: 'core', equip: 'gym', tier: 3, load: 'machine', inc: 2.5, avoid: [], cue: 'Resist rotation, press out and hold 2s.' },
];

export const BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const PATTERN_LABEL = {
  squat: 'Squat', hinge: 'Hinge', lunge: 'Single-leg', quad: 'Quads', ham: 'Hamstrings',
  hpush: 'Horizontal push', vpush: 'Vertical push', hpull: 'Horizontal pull', vpull: 'Vertical pull',
  chest_iso: 'Chest', delt_side: 'Side delts', delt_rear: 'Rear delts', biceps: 'Biceps',
  triceps: 'Triceps', calves: 'Calves', glute: 'Glutes', core: 'Core',
};

/** All exercises for a pattern the user can do with their equipment and injuries, best first. */
export function optionsFor(pattern, equipment, injuries = []) {
  const rank = EQUIP_RANK[equipment] ?? 2;
  const ok = EXERCISES.filter(
    (e) => e.pattern === pattern && EQUIP_RANK[e.equip] <= rank && !e.avoid.some((a) => injuries.includes(a)),
  );
  // Prefer lower tier (bigger movement), then the most equipment-specific option (use the gym if you have one).
  return ok.sort((a, b) => a.tier - b.tier || EQUIP_RANK[b.equip] - EQUIP_RANK[a.equip]);
}

/** Every option for the pattern regardless of injuries (used for the manual swap menu). */
export function swapOptions(pattern, equipment) {
  return optionsFor(pattern, equipment, []);
}
