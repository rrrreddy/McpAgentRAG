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

// ---- Coaching guide per movement pattern: what it trains, how to do it, what to avoid.
export const PATTERN_GUIDE = {
  squat: {
    muscles: 'Quads, glutes, adductors, core',
    steps: ['Feet shoulder-width, toes slightly out.', 'Big breath into your belly and brace like someone is about to poke your stomach.', 'Sit down and back between your hips, knees travel over your toes.', 'Go as deep as you can with a neutral back, then drive up through the whole foot.'],
    mistakes: ['Knees caving inward', 'Heels lifting off the floor', 'Chest collapsing forward on the way up', 'Bouncing out of the bottom'],
    breathing: 'Inhale and brace at the top, hold down and up, exhale at the top.',
  },
  hinge: {
    muscles: 'Hamstrings, glutes, lower & upper back, grip',
    steps: ['Stand with the weight over mid-foot, feet hip-width.', 'Push your hips back like closing a car door with your bum, knees soft.', 'Keep the weight close to your legs and your back flat — chest proud.', 'Stand up by squeezing your glutes and pushing the floor away.'],
    mistakes: ['Rounding the lower back', 'Letting the weight drift away from the legs', 'Squatting the weight instead of hinging', 'Leaning back at the top'],
    breathing: 'Brace before each rep, exhale at the top.',
  },
  lunge: {
    muscles: 'Quads, glutes, adductors, balance',
    steps: ['Take a long split stance, hips square to the front.', 'Lower straight down until the back knee is just above the floor.', 'Keep most of your weight on the front foot.', 'Drive through the front heel to stand back up.'],
    mistakes: ['Front knee caving in', 'Stance too short (knee way past toes, heel lifts)', 'Pushing off the back foot', 'Torso twisting'],
    breathing: 'Inhale down, exhale up.',
  },
  quad: {
    muscles: 'Quadriceps',
    steps: ['Set the pad just above the ankles and align your knee with the machine pivot.', 'Hold the handles, back against the seat.', 'Straighten your legs and squeeze for 1 second.', 'Lower slowly over 2–3 seconds.'],
    mistakes: ['Swinging the weight', 'Lifting hips off the seat', 'Cutting the range short'],
    breathing: 'Exhale as you extend, inhale as you lower.',
  },
  ham: {
    muscles: 'Hamstrings',
    steps: ['Line up your knees with the pivot, pad just above the heels.', 'Keep your hips pinned to the seat/bench.', 'Curl your heels toward your glutes and squeeze.', 'Return slowly until your legs are almost straight.'],
    mistakes: ['Hips lifting', 'Fast, jerky reps', 'Partial range'],
    breathing: 'Exhale as you curl, inhale on the way back.',
  },
  hpush: {
    muscles: 'Chest, front delts, triceps',
    steps: ['Lie with eyes under the bar, feet flat, slight arch.', 'Squeeze shoulder blades together and down.', 'Lower the weight to the lower chest with elbows about 45° from your body.', 'Press up and slightly back toward your face.'],
    mistakes: ['Elbows flared out to 90°', 'Bouncing off the chest', 'Hips lifting off the bench', 'Shoulders rolling forward at the top'],
    breathing: 'Inhale on the way down, exhale as you press.',
  },
  vpush: {
    muscles: 'Shoulders, triceps, upper chest, core',
    steps: ['Hands just outside shoulders, forearms vertical.', 'Squeeze glutes and brace so your lower back doesn’t arch.', 'Press straight up, moving your head back then through once the weight passes it.', 'Finish with arms locked and biceps by your ears.'],
    mistakes: ['Leaning back excessively', 'Pressing forward instead of up', 'Flaring the ribs'],
    breathing: 'Brace at the bottom, exhale at lockout.',
  },
  hpull: {
    muscles: 'Lats, mid-back, rear delts, biceps',
    steps: ['Hinge or lie chest-down so your torso is supported or stable.', 'Start with arms long and shoulder blades stretched forward.', 'Pull your elbows back toward your hips.', 'Pause and squeeze your shoulder blades, then lower under control.'],
    mistakes: ['Jerking with the lower back', 'Shrugging the shoulders to the ears', 'Only moving the arms, not the shoulder blades'],
    breathing: 'Exhale as you pull, inhale as you lower.',
  },
  vpull: {
    muscles: 'Lats, biceps, rear delts, grip',
    steps: ['Grip slightly wider than shoulders.', 'Start from a dead hang / full stretch.', 'Pull your elbows down to your ribs, chest up toward the bar.', 'Lower all the way until your arms are straight.'],
    mistakes: ['Half reps', 'Swinging or kipping', 'Pulling with the neck (chin poking)'],
    breathing: 'Exhale as you pull, inhale as you lower.',
  },
  chest_iso: {
    muscles: 'Chest',
    steps: ['Keep a slight, fixed bend in your elbows.', 'Open your arms in a wide arc until you feel a chest stretch.', 'Bring the hands together as if hugging a big tree.', 'Squeeze the chest for a second.'],
    mistakes: ['Turning it into a press (bending elbows more)', 'Going too heavy and overstretching the shoulders'],
    breathing: 'Inhale as you open, exhale as you squeeze.',
  },
  delt_side: {
    muscles: 'Side delts (shoulder width)',
    steps: ['Stand tall, slight forward lean, dumbbells at your sides.', 'Raise your arms out to the side, leading with the elbows.', 'Stop at shoulder height, pinkies roughly level with thumbs.', 'Lower slowly over 2–3 seconds.'],
    mistakes: ['Swinging with the body', 'Shrugging with the traps', 'Going too heavy'],
    breathing: 'Exhale as you raise, inhale as you lower.',
  },
  delt_rear: {
    muscles: 'Rear delts, upper back',
    steps: ['Hinge forward with a flat back (or lie chest-down on an incline bench).', 'Arms hang with a soft bend in the elbows.', 'Sweep your arms out wide, like spreading wings.', 'Pause, then lower under control.'],
    mistakes: ['Using momentum', 'Squeezing shoulder blades instead of moving the arms', 'Too heavy'],
    breathing: 'Exhale as you raise.',
  },
  biceps: {
    muscles: 'Biceps, forearms',
    steps: ['Stand tall, elbows by your sides.', 'Curl the weight up without moving your elbows forward.', 'Squeeze at the top.', 'Lower all the way down slowly.'],
    mistakes: ['Swinging the body', 'Elbows drifting forward', 'Cutting the bottom of the rep'],
    breathing: 'Exhale as you curl, inhale as you lower.',
  },
  triceps: {
    muscles: 'Triceps',
    steps: ['Pin your elbows in place (by your sides or overhead).', 'Straighten your arms fully and squeeze the back of your arm.', 'Return slowly until you feel a stretch.'],
    mistakes: ['Elbows moving around', 'Leaning into it with bodyweight', 'Half reps'],
    breathing: 'Exhale as you extend.',
  },
  calves: {
    muscles: 'Calves',
    steps: ['Stand on the edge of a step with the balls of your feet.', 'Lower your heels for a deep stretch and pause 2 seconds.', 'Rise as high as you can onto your toes.', 'Pause at the top, then lower slowly.'],
    mistakes: ['Bouncing', 'Tiny range of motion', 'Bending the knees to cheat'],
    breathing: 'Breathe steadily; exhale as you rise.',
  },
  glute: {
    muscles: 'Glutes, hamstrings',
    steps: ['Upper back on a bench (or floor for bridges), feet flat, shins vertical at the top.', 'Tuck your chin and ribs down.', 'Drive through your heels to lift the hips until your body is a straight line.', 'Squeeze your glutes hard for 1 second at the top.'],
    mistakes: ['Arching the lower back instead of using the glutes', 'Feet too close or too far', 'Pushing through the toes'],
    breathing: 'Exhale as you drive up.',
  },
  core: {
    muscles: 'Abs, obliques, deep core',
    steps: ['Press your lower back gently into the floor (or keep ribs down in a plank).', 'Move slowly — control is the point.', 'Keep breathing; don’t hold your breath for the whole set.', 'Stop the set when you can’t keep your position.'],
    mistakes: ['Lower back arching off the floor', 'Rushing reps', 'Holding breath'],
    breathing: 'Slow exhales while you brace.',
  },
};

/** Open a YouTube search for a form video of this exercise (works offline-safe: just a link). */
export function videoUrl(ex) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} proper form tutorial`)}`;
}

// ---- General training guide (Guide tab)
export const GUIDE_TOPICS = [
  { id: 'start', title: 'How this app works', body: [
    'You get a 12-week plan built from your goal, schedule, equipment, current strength and fitness level.',
    'Each session, the Today tab shows exactly what to do: exercises, sets, reps and the weight to use.',
    'Log what you actually lifted. The app learns your real strength and sets next session\'s weights automatically.',
    'Once a week, do the 1-minute check-in (weight, sleep, energy, soreness). Calories, volume and exercises adapt to how you respond.',
  ] },
  { id: 'rir', title: 'Reps in reserve (RIR) — how hard to push', body: [
    'RIR = how many more reps you could have done with good form. "2 RIR" means stop when 2 clean reps are left in the tank.',
    'The plan ramps effort across each block: 3 → 2 → 1 RIR, then a deload week.',
    'If you finish a set and could have done 5 more, the weight is too light — the app will increase it once you log it.',
  ] },
  { id: 'warmup', title: 'Warm-up (5–8 minutes)', body: [
    '3–5 minutes of easy cardio (bike, brisk walk, rower) to raise body temperature.',
    'Dynamic moves: 10 leg swings each side, 10 arm circles, 10 bodyweight squats, 10 hip hinges.',
    'Before your first exercise: 1 set of 10 with ~50% of your working weight, 1 set of 5 with ~75%.',
  ] },
  { id: 'overload', title: 'Progressive overload — how you get results', body: [
    'Muscles grow and get stronger when you gradually do more: more reps at the same weight, then more weight.',
    'Double progression: work in a rep range (e.g. 8–10). When you hit 10 on all sets, the weight goes up and you start at 8 again.',
    'The app does this for you from your logs — just log honestly.',
  ] },
  { id: 'deload', title: 'Deload weeks', body: [
    'Every 4th week, sets are halved and loads drop ~10%. This lets joints and nervous system recover so you keep progressing.',
    'If check-ins show poor recovery two weeks running, the app inserts an extra deload.',
  ] },
  { id: 'nutrition', title: 'Nutrition basics', body: [
    'Hit your protein target every day — spread over 3–5 meals (about 25–40 g each).',
    'Calories drive weight change; the app adjusts them from your weekly weigh-ins.',
    'Base meals on lean protein, vegetables, fruit, whole grains, potatoes/rice, and healthy fats.',
    'Drink water through the day; more on training days and in heat.',
  ] },
  { id: 'recovery', title: 'Sleep & recovery', body: [
    '7–9 hours of sleep is the single biggest recovery tool. Under 6 hours slows muscle gain and fat loss.',
    'Sore for 1–2 days is normal. Sharp or joint pain is not — report it in the check-in and swap the exercise.',
    'Daily steps and light cardio speed up recovery.',
  ] },
  { id: 'log', title: 'Using the gym log', body: [
    'Enter the weight and reps you actually did for each set, then tap ✓ to start the rest timer.',
    'Did an exercise that\'s not in your plan? Use Log → "Log extra exercise".',
    'Personal records (PRs) are detected automatically and shown in Log → Records.',
  ] },
  { id: 'safety', title: 'Safety', body: [
    'Learn the movement with light weight before going heavy.',
    'Use safety pins/spotter arms for heavy bench and squats.',
    'Stop immediately with chest pain, dizziness, or sharp joint pain. See a doctor before starting if you have a heart condition, high blood pressure, are pregnant, or have a recent injury.',
  ] },
];
