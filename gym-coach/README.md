# GymCoach AI — free, open-source AI gym coach for iPhone

GymCoach builds you a **12-week (3-month) training and nutrition plan** from your goal and how you train now.
It then **adjusts the plan automatically** as you log workouts and do weekly check-ins. An optional
**on-device open-source LLM** (Qwen2.5 / Llama 3.2 via [WebLLM](https://github.com/mlc-ai/web-llm)) answers
questions and suggests changes. It's free, has no account or server, and all data stays on your phone.

## Install on iPhone (no App Store)

### Option A: Home Screen app (recommended, 2 minutes, no Apple ID or computer needed)

1. One-time: in this GitHub repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   Then either merge this branch into `main`, or add `claude/gym-trading-ai-app-pemten` under
   **Settings → Environments → github-pages → Deployment branches**. The workflow
   `.github/workflows/gym-coach-pages.yml` runs the tests and publishes the app to
   `https://<your-username>.github.io/McpAgentRAG/`.
2. On your iPhone, open that link in **Safari**.
3. Tap **Share → Add to Home Screen → Add**.

It opens full-screen with its own icon, works offline, and updates itself when you push changes.
It never expires, which a sideloaded app does.

> Any HTTPS static host works too (Netlify, Cloudflare Pages, Vercel): upload the files in `gym-coach/`
> except `tests/` and `native/`. HTTPS is required for offline mode and on-device AI.

### Option B: a real `.ipa` file (sideloading)

iOS won't install an unsigned app file, so a free Apple ID has to sign it:

1. In GitHub, open **Actions → "GymCoach iOS .ipa" → Run workflow** (free macOS runner). Download
   `GymCoachAI-unsigned-ipa` from the finished run.
2. On a Windows or Mac computer, install **[Sideloadly](https://sideloadly.io)** (or **AltStore**). Plug in your iPhone,
   drop in the `.ipa`, sign in with your Apple ID, and click Start.
3. On the iPhone, enable **Settings → Privacy & Security → Developer Mode**. Then trust your Apple ID under
   **Settings → General → VPN & Device Management**.

With a free Apple ID the app **expires after 7 days** and must be re-signed. AltStore can do that automatically over
Wi-Fi. This is an Apple restriction, which is why Option A is recommended.

## What it does

| | |
|---|---|
| **Onboarding** | Age, sex, height, weight, **target weight**, goal (lose fat / build muscle / recomp / strength / endurance / general), experience, days per week (2–6), minutes per session, equipment (gym / dumbbells / bodyweight), injuries, **your current routine**, current working weights, a **quick fitness test** (push-ups, pull-ups, plank), sleep and current cardio |
| **Built from your inputs** | The Plan tab shows how each input shaped the plan. Starting weights come from your lifts, or are estimated from your bodyweight, sex and level. People not training now get a 2-week on-ramp. Push-up and pull-up scores scale the bodyweight moves. Short sleep trims volume. Calories are sized to reach your target weight at a safe rate, and the app tells you whether the target is realistic in 12 weeks |
| **Guide** | An animated demo for every movement (works offline), step-by-step form, common mistakes, breathing, and a "Watch video demos" button that opens YouTube for that exact exercise. Also covers warm-up, RIR, progressive overload, deloads, nutrition, recovery and safety |
| **Gym log** | History, personal records with automatic 🏆 PR detection, a per-exercise history sheet, weekly volume and streak, logging of extra exercises outside the plan, the weekly check-in, and bodyweight and strength charts |
| **12-week plan** | 3 blocks (Foundation → Build → Peak), deload every 4th week, effort ramps 3 → 2 → 1 reps in reserve, split chosen by days (Full Body / Upper-Lower / PPL), exercises chosen by equipment, injuries and experience, session length fits your time |
| **Nutrition** | Mifflin-St Jeor calories, goal-based deficit or surplus, protein/carbs/fat, water, fibre, steps and cardio per week |
| **Workout logger** | Suggested weight for every set, rest timer, swap any exercise, notes and session RPE |
| **Auto-progression** | Estimated 1RM per exercise from your logs. Hit the top of the rep range and the weight goes up; miss twice and it drops about 8% |
| **Weekly check-in** | Bodyweight trend adjusts calories (±100–150 kcal). Poor recovery cuts volume or adds a deload. Great recovery adds sets. Reported pain swaps out exercises that load that joint |
| **AI coach** | Chat that sees your profile, plan, logs and check-ins. It can propose calorie or volume changes, and you apply them with one tap |
| **Progress** | Bodyweight and strength charts, a log of every automatic decision, workout history, JSON backup export/import |

## AI options (all free)

- **On-device** (default): the model downloads once (~0.9–1.6 GB, use Wi-Fi), then runs offline on the iPhone GPU.
  It needs **iOS 26+** (WebGPU in Safari). Use *Qwen2.5 1.5B* on iPhone 15 Pro or newer, and *Qwen2.5 0.5B* or
  *Llama 3.2 1B* on older phones.
- **Remote**: any OpenAI-compatible API. The app has presets for **Groq** and **OpenRouter** free models (you need a free
  API key), or you can point it at **Ollama** on your own computer through an HTTPS tunnel.
- **No AI at all**: the plan, progression and check-in adaptation run on built-in, evidence-based rules, so
  the app is fully functional without a model.

## Develop

No build step: plain HTML, CSS and ES modules.

```bash
cd gym-coach && python3 -m http.server 8000   # open http://localhost:8000
node --test gym-coach/tests/*.test.mjs        # from the repo root: plan & adaptation engine tests
```

| File | Purpose |
|---|---|
| `js/exercises.js` | Exercise library: pattern, equipment level, injury flags, cues, form guide, training topics |
| `js/animations.js` | Stick-figure exercise animations (pose keyframes + 2-bone IK), offline |
| `js/planner.js` | 12-week periodization, splits, sets/reps/RIR, loads, nutrition, projections |
| `js/progress.js` | Logs → strength estimates; check-ins → calorie/volume/deload/exercise adjustments |
| `js/ai.js` | WebLLM on-device + OpenAI-compatible remote chat, context builder |
| `js/app.js` | UI (Today / Plan / Progress / Coach / Settings) |
| `native/` | Capacitor wrapper used by the `.ipa` workflow |

*Not medical advice. Check with a doctor before starting a new program if you have a health condition.*
