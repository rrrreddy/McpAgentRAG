// Gen-AI coach. Two free, open-source-friendly back-ends:
//  1. On-device: WebLLM (Apache-2.0) runs open-weight models (Qwen2.5, Llama 3.2) on the phone's GPU via WebGPU.
//     Nothing leaves the phone; the model downloads once and is cached.
//  2. Any OpenAI-compatible endpoint: Ollama / LM Studio on your own computer, or free hosted tiers
//     (e.g. Groq, OpenRouter ":free" models) with your own key.

import { BY_ID } from './exercises.js';
import { GOALS } from './planner.js';

const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';

export const LOCAL_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B — best quality (~1.6 GB, iPhone 15 Pro or newer)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B — balanced (~0.9 GB)' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B — lightest & fastest (~0.9 GB VRAM, older iPhones)' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', label: 'Qwen2.5 1.5B f32 — use if the f16 models fail to load' },
];

let engine = null;
let engineModel = null;

export function webgpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function loadLocalModel(modelId, onProgress) {
  if (engine && engineModel === modelId) return engine;
  if (!webgpuAvailable()) {
    throw new Error('WebGPU is not available in this browser. On iPhone it needs iOS 26+ Safari. Use the "Remote" option instead, or keep using the built-in (non-AI) coach.');
  }
  const webllm = await import(/* @vite-ignore */ WEBLLM_URL);
  if (engine) { try { await engine.unload(); } catch { /* ignore */ } }
  engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (r) => onProgress?.(r.progress ?? 0, r.text ?? ''),
  });
  engineModel = modelId;
  return engine;
}

export async function isModelCached(modelId) {
  try {
    const webllm = await import(/* @vite-ignore */ WEBLLM_URL);
    return await webllm.hasModelInCache(modelId);
  } catch {
    return false;
  }
}

export async function deleteLocalModel(modelId) {
  const webllm = await import(/* @vite-ignore */ WEBLLM_URL);
  if (engine && engineModel === modelId) { try { await engine.unload(); } catch { /* ignore */ } engine = null; engineModel = null; }
  await webllm.deleteModelAllInfoInCache(modelId);
}

/**
 * Stream a chat completion. settings.mode: 'local' | 'remote'. Calls onToken with each text delta.
 */
export async function chat(settings, messages, onToken, signal) {
  if (settings.mode === 'remote') return remoteChat(settings, messages, onToken, signal);
  const eng = await loadLocalModel(settings.localModel, settings.onProgress);
  const stream = await eng.chat.completions.create({ messages, stream: true, temperature: 0.6, max_tokens: 700 });
  let text = '';
  for await (const chunk of stream) {
    if (signal?.aborted) { try { eng.interruptGenerate(); } catch { /* ignore */ } break; }
    const d = chunk.choices?.[0]?.delta?.content || '';
    if (d) { text += d; onToken?.(d, text); }
  }
  return text;
}

async function remoteChat(settings, messages, onToken, signal) {
  const base = (settings.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Set the API base URL in Coach → AI settings.');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: settings.remoteModel, messages, stream: true, temperature: 0.6, max_tokens: 900 }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI server error ${res.status}: ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') return text;
      try {
        const d = JSON.parse(data).choices?.[0]?.delta?.content || '';
        if (d) { text += d; onToken?.(d, text); }
      } catch { /* partial line */ }
    }
  }
  return text;
}

/** Compact, token-cheap summary of the user's profile, current plan and recent training for the system prompt. */
export function buildContext(state, plan, week) {
  const p = state.profile;
  const wk = plan.weeks[week - 1];
  const n = plan.nutrition;
  const lines = [];
  lines.push(`ATHLETE: ${p.name || 'User'}, ${p.age}y, ${p.sex}, ${p.heightCm}cm, start ${p.weightKg}kg${state.adjustments?.currentWeightKg ? `, now ${state.adjustments.currentWeightKg}kg` : ''}.`);
  lines.push(`GOAL: ${GOALS[p.goal]}${p.targetWeightKg ? ` (target ${p.targetWeightKg}kg)` : ''}. Experience: ${p.experience}. ${p.days} days/wk, ${p.minutes} min/session. Equipment: ${p.equipment}. Injuries: ${(p.injuries || []).join(', ') || 'none'}.`);
  if (p.currentRoutine) lines.push(`WHAT THEY DID BEFORE: ${p.currentRoutine}`);
  lines.push(`PLAN: ${plan.split}, week ${week}/12 (${wk.blockName} block${wk.deload ? ', DELOAD' : ''}, target ${wk.rir} reps in reserve).`);
  lines.push(`THIS WEEK: ${wk.days.map((d) => `${d.name}: ${d.exercises.map((e) => `${e.name} ${e.sets}x${e.reps[0]}-${e.reps[1]}${e.load ? ` @${e.load}kg` : ''}`).join('; ')}`).join(' | ')}`);
  lines.push(`NUTRITION: ${n.calories} kcal, P${n.protein}g C${n.carbs}g F${n.fat}g. Cardio: ${wk.cardio.sessions}; ${wk.cardio.steps} steps/day.`);
  const logs = (state.logs || []).slice(-4);
  if (logs.length) {
    lines.push('RECENT WORKOUTS:');
    for (const l of logs) {
      lines.push(`- ${l.date} W${l.week} ${l.dayName}: ${l.entries.map((e) => `${BY_ID[e.id]?.name || e.id} ${e.sets.filter((s) => s.r).map((s) => `${s.w || 'BW'}x${s.r}`).join(',')}`).join('; ')}${l.rpe ? ` (session RPE ${l.rpe})` : ''}${l.notes ? ` notes: ${l.notes}` : ''}`);
    }
  }
  const cis = (state.checkIns || []).slice(-3);
  if (cis.length) {
    lines.push('CHECK-INS:');
    for (const c of cis) lines.push(`- W${c.week}: ${c.weightKg || '?'}kg (${c.weeklyChangePct ?? '?'}%/wk), recovery ${c.recovery}/5, adherence ${Math.round((c.adherence || 0) * 100)}%${c.pain?.length ? `, pain: ${c.pain.join(',')}` : ''}${c.notes ? `, notes: ${c.notes}` : ''}`);
  }
  const ev = (state.events || []).slice(-4);
  if (ev.length) lines.push(`AUTO-ADJUSTMENTS MADE: ${ev.map((e) => e.text).join(' ')}`);
  return lines.join('\n');
}

export function systemPrompt(context) {
  return `You are "Coach", an expert strength & conditioning coach and sports nutritionist inside a gym training app.
The app already generated a 12-week periodized plan and adjusts it automatically from logs and weekly check-ins. You explain it, motivate, answer questions, and suggest changes.
Rules:
- Be concise, specific and practical. Use short bullet points. Use the athlete's numbers.
- Base advice on established evidence (progressive overload, 10-20 hard sets/muscle/week, 1.6-2.2 g/kg protein, 7-9 h sleep).
- Never diagnose injuries; for sharp or lasting pain tell them to see a professional.
- If you recommend a change to calories or weekly volume, end your answer with ONE line exactly like:
ADJUST {"calorieDelta": -100, "volumeDelta": 0}
(calorieDelta = kcal/day to add or remove, between -300 and 300; volumeDelta = sets to add or remove on accessories, between -2 and 2). Omit that line if no change is needed.

ATHLETE DATA:
${context}`;
}

/** Parse an optional ADJUST {...} line from the model's answer. Returns null when absent/invalid. */
export function parseAdjust(text) {
  const m = /ADJUST\s*(\{[^}]*\})/.exec(text || '');
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    const cal = Math.max(-300, Math.min(300, Math.round(Number(o.calorieDelta) || 0)));
    const vol = Math.max(-2, Math.min(2, Math.round(Number(o.volumeDelta) || 0)));
    if (!cal && !vol) return null;
    return { calorieDelta: cal, volumeDelta: vol };
  } catch {
    return null;
  }
}

export const QUICK_PROMPTS = [
  'Review my progress and tell me what to change for next week.',
  'Explain my plan for the next 3 months in simple terms.',
  'Give me a simple meal plan for one day that hits my macros.',
  'I have only 30 minutes today — how should I shorten my workout?',
  'My motivation is low. Help me stay on track.',
];
