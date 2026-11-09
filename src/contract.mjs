// SovaFlow workflow contract v1 (F-001).
// A *job* describes what a human wants and which optional adapters may be used.
// A *record* describes what actually happened, step by step, with evidence.
// The contract keeps six things apart: intention, proposed edits, accepted edits,
// verified state, output artifacts and human feedback. Audible output is never
// inferred by software: only a human can mark it as heard.
import {createHash} from 'node:crypto';

export const JOB_SCHEMA = 'sovaflow.job/1';
export const RECORD_SCHEMA = 'sovaflow.record/1';

/** Step states, in the order evidence accumulates. Terminal states end a step. */
export const STEP_STATES = Object.freeze(['requested', 'proposed', 'accepted', 'verified']);
export const TERMINAL_STATES = Object.freeze(['verified', 'unavailable', 'failed', 'cancelled', 'skipped', 'proposed-only']);
export const RUN_STATES = Object.freeze(['planned', 'running', 'completed', 'dry-run-completed', 'blocked', 'failed', 'cancelled']);
export const AUDIBLE_STATES = Object.freeze(['not-verified', 'human-heard']);
export const ADAPTERS = Object.freeze({
  synthetic: ['compose', 'note'],
  deepchord: ['demo', 'compose', 'validate', 'feedback', 'logic-open'],
  sovaroll: ['state', 'import-midi', 'command', 'export-midi', 'undo'],
});

export class ContractError extends Error {
  constructor(problems) { super(`Invalid SovaFlow document:\n- ${problems.join('\n- ')}`); this.name = 'ContractError'; this.problems = problems; }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Canonical JSON (sorted keys) so identical arguments always hash the same way. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Retry identity: the same job, iteration, step and arguments → the same key, so a resumed run never applies an edit twice. */
export function retryKey(jobId, iteration, step) {
  return sha256(canonical({jobId, iteration, id: step.id, adapter: step.adapter, action: step.action, args: step.args ?? {}, input: step.input ?? null})).slice(0, 24);
}

/** Validate a job document. Returns the list of problems (empty = valid). */
export function jobProblems(job) {
  const p = [];
  if (!isObject(job)) return ['job must be a JSON object'];
  if (job.schema !== JOB_SCHEMA) p.push(`schema must be "${JOB_SCHEMA}"`);
  if (typeof job.id !== 'string' || !ID.test(job.id)) p.push('id must be 1–64 letters, digits, ".", "_" or "-"');
  if (!isObject(job.intention) || typeof job.intention.text !== 'string' || !job.intention.text.trim()) p.push('intention.text must describe what the human wants');
  if (job.intention?.bars !== undefined && !(Number.isInteger(job.intention.bars) && job.intention.bars >= 1 && job.intention.bars <= 64)) p.push('intention.bars must be an integer 1–64');
  if (job.adapters !== undefined && !isObject(job.adapters)) p.push('adapters must be an object');
  for (const [name, cfg] of Object.entries(job.adapters ?? {})) {
    if (!(name in ADAPTERS)) p.push(`adapters.${name} is not a known adapter (${Object.keys(ADAPTERS).join(', ')})`);
    if (!isObject(cfg)) p.push(`adapters.${name} must be an object`);
  }
  if (job.adapters?.sovaroll?.url !== undefined) {
    try { const u = new URL(job.adapters.sovaroll.url); if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) p.push('adapters.sovaroll.url must be a local address (127.0.0.1, localhost or [::1])'); } catch { p.push('adapters.sovaroll.url must be a URL'); }
  }
  if (!Array.isArray(job.steps) || job.steps.length < 1 || job.steps.length > 32) p.push('steps must be an array of 1–32 steps');
  const seen = new Set();
  for (const [i, s] of (Array.isArray(job.steps) ? job.steps : []).entries()) {
    const at = `steps[${i}]`;
    if (!isObject(s)) { p.push(`${at} must be an object`); continue; }
    if (typeof s.id !== 'string' || !ID.test(s.id)) p.push(`${at}.id is invalid`);
    else if (seen.has(s.id)) p.push(`${at}.id "${s.id}" is duplicated`); else seen.add(s.id);
    if (!(s.adapter in ADAPTERS)) p.push(`${at}.adapter must be one of ${Object.keys(ADAPTERS).join(', ')}`);
    else if (!ADAPTERS[s.adapter].includes(s.action)) p.push(`${at}.action "${s.action}" is not supported by ${s.adapter} (${ADAPTERS[s.adapter].join(', ')})`);
    if (s.args !== undefined && !isObject(s.args)) p.push(`${at}.args must be an object`);
    if (s.input !== undefined) {
      if (typeof s.input !== 'string' || !/^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$/.test(s.input)) p.push(`${at}.input must look like "stepId:artifactKind" (for example "compose:midi")`);
      else if (!seen.has(s.input.split(':')[0]) || s.input.split(':')[0] === s.id) p.push(`${at}.input must refer to an earlier step`);
    }
  }
  const pol = job.policy ?? {};
  if (!isObject(pol)) p.push('policy must be an object');
  else {
    if (pol.maxIterations !== undefined && !(Number.isInteger(pol.maxIterations) && pol.maxIterations >= 1 && pol.maxIterations <= 20)) p.push('policy.maxIterations must be 1–20');
    if (pol.targetRating !== undefined && !(Number.isInteger(pol.targetRating) && pol.targetRating >= 1 && pol.targetRating <= 5)) p.push('policy.targetRating must be 1–5');
    if (pol.onUnavailable !== undefined && !['block', 'skip'].includes(pol.onUnavailable)) p.push('policy.onUnavailable must be "block" or "skip"');
  }
  return p;
}

export function assertJob(job) { const p = jobProblems(job); if (p.length) throw new ContractError(p); return job; }

/** Validate a run record (what happened). */
export function recordProblems(rec) {
  const p = [];
  if (!isObject(rec)) return ['record must be a JSON object'];
  if (rec.schema !== RECORD_SCHEMA) p.push(`schema must be "${RECORD_SCHEMA}"`);
  if (!RUN_STATES.includes(rec.status)) p.push(`status must be one of ${RUN_STATES.join(', ')}`);
  if (!Number.isInteger(rec.iteration) || rec.iteration < 1) p.push('iteration must be ≥ 1');
  if (!AUDIBLE_STATES.includes(rec.audible?.status)) p.push(`audible.status must be one of ${AUDIBLE_STATES.join(', ')}`);
  if (rec.audible?.status === 'human-heard' && !rec.feedback?.some(f => f.heard === true)) p.push('audible.status "human-heard" requires a human feedback entry with heard=true');
  for (const [i, s] of (rec.steps ?? []).entries()) {
    const all = [...STEP_STATES, ...TERMINAL_STATES];
    if (!all.includes(s.state)) p.push(`steps[${i}].state "${s.state}" is unknown`);
    if (s.state === 'verified' && !s.verified) p.push(`steps[${i}] is "verified" but has no verified evidence`);
    if (s.state === 'accepted' && !s.accepted) p.push(`steps[${i}] is "accepted" but has no accepted evidence`);
    if (s.state === 'unavailable' && !s.unavailable) p.push(`steps[${i}] is "unavailable" but has no reason`);
    for (const a of s.artifacts ?? []) if (!a.path || !/^[0-9a-f]{64}$/.test(a.sha256 ?? '')) p.push(`steps[${i}] artifact needs path and sha256`);
  }
  for (const [i, f] of (rec.feedback ?? []).entries()) {
    if (f.rating !== undefined && !(Number.isInteger(f.rating) && f.rating >= 1 && f.rating <= 5)) p.push(`feedback[${i}].rating must be 1–5`);
    if (typeof f.note !== 'string') p.push(`feedback[${i}].note must be text`);
  }
  return p;
}

/** Decide whether another iteration should start. Pure function, used by `iterate` and tests. */
export function stopDecision(job, records) {
  const max = job.policy?.maxIterations ?? 3, target = job.policy?.targetRating ?? 4;
  const last = records.at(-1);
  if (!last) return {stop: false, reason: 'no run yet'};
  const fb = last.feedback?.at(-1);
  if (fb?.stop) return {stop: true, reason: 'human asked to stop'};
  if (fb?.rating !== undefined && fb.rating >= target) return {stop: true, reason: `rating ${fb.rating} reached target ${target}`};
  if (last.iteration >= max) return {stop: true, reason: `reached maxIterations ${max}`};
  if (['failed', 'blocked', 'cancelled'].includes(last.status)) return {stop: true, reason: `last run is ${last.status}; fix it before iterating`};
  if (!fb) return {stop: true, reason: 'waiting for human feedback (sovaflow feedback RUN --rating N --note "...")'};
  return {stop: false, reason: `rating ${fb.rating ?? 'none'} below target ${target}; iteration ${last.iteration + 1} of ${max} allowed`};
}
