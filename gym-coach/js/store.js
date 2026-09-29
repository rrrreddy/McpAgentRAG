// All data stays on the phone (localStorage). Export/import JSON for backups or moving phones.

import { defaultAdjustments } from './progress.js';

const KEY = 'gymcoach.v1';

export function emptyState() {
  return {
    version: 1,
    profile: null,
    startDate: null,
    adjustments: defaultAdjustments(),
    exState: {},
    logs: [],
    checkIns: [],
    events: [],
    chat: [],
    ai: { mode: 'local', localModel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', baseUrl: '', apiKey: '', remoteModel: '' },
    drafts: {},
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    const base = emptyState();
    return { ...base, ...s, adjustments: { ...base.adjustments, ...(s.adjustments || {}) }, ai: { ...base.ai, ...(s.ai || {}) } };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJson(state) {
  const copy = { ...state, ai: { ...state.ai, apiKey: '' } }; // never put the API key in a backup file
  return JSON.stringify(copy, null, 2);
}

export function importJson(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== 'object' || !('profile' in s)) throw new Error('Not a GymCoach backup file.');
  const base = emptyState();
  return { ...base, ...s, adjustments: { ...base.adjustments, ...(s.adjustments || {}) }, ai: { ...base.ai, ...(s.ai || {}) } };
}
