// Executes a job step by step and writes the evidence record (F-001 runtime, F-004 iteration).
import {promises as fs, existsSync} from 'node:fs';
import path from 'node:path';
import {assertJob, RECORD_SCHEMA, retryKey, recordProblems, stopDecision, sha256} from './contract.mjs';
import {createRunDir, keepArtifact, writeJson, readJson} from './store.mjs';
import {synthetic} from './adapters/synthetic.mjs';
import {sovaroll} from './adapters/sovaroll.mjs';
import {deepchord} from './adapters/deepchord.mjs';

export const ADAPTER_IMPLS = {synthetic, sovaroll, deepchord};
export const VERSION = '0.1.0';

export async function probeAll(job) {
  const used = [...new Set((job?.steps ?? []).map(s => s.adapter))];
  const names = used.length ? used : Object.keys(ADAPTER_IMPLS);
  const out = {};
  for (const n of names) out[n] = await ADAPTER_IMPLS[n].probe(job ?? {adapters: {}});
  return out;
}

const cancelFile = runDir => path.join(runDir, 'CANCEL');
export async function requestCancel(runDir) { await fs.writeFile(cancelFile(runDir), new Date().toISOString() + '\n'); }

/**
 * Run (or resume) a job.
 * options: {home, dryRun, iteration, previous: {dir, record}, resume: {dir, record}, signal, log}
 */
export async function runJob(job, options = {}) {
  assertJob(job);
  const log = options.log ?? (() => {});
  const iteration = options.resume?.record.iteration ?? options.iteration ?? 1;
  const runDir = options.resume?.dir ?? await createRunDir(options.home, job.id, iteration);
  const old = new Map((options.resume?.record.steps ?? []).map(s => [s.id, s]));
  const record = {
    schema: RECORD_SCHEMA, sovaflow: VERSION, jobId: job.id, title: job.title ?? null, iteration, runDir,
    createdAt: options.resume?.record.createdAt ?? new Date().toISOString(), updatedAt: null,
    dryRun: Boolean(options.dryRun), status: 'running', intention: job.intention,
    previousRun: options.previous?.dir ?? options.resume?.record.previousRun ?? null,
    capabilities: {}, steps: [], feedback: options.resume?.record.feedback ?? [], audible: options.resume?.record.audible ?? {status: 'not-verified'},
  };
  if (!options.resume) await writeJson(path.join(runDir, 'job.json'), job);
  if (existsSync(cancelFile(runDir))) await fs.rm(cancelFile(runDir));
  const save = async () => { record.updatedAt = new Date().toISOString(); await writeJson(path.join(runDir, 'record.json'), record); };
  await save();

  const byId = new Map();
  const prevRecord = options.previous?.record;
  const ctxBase = {
    job, iteration, dryRun: Boolean(options.dryRun), signal: options.signal,
    stepRecord: id => byId.get(id),
    inputFor: step => {
      if (!step.input) return null;
      const [id, kind] = step.input.split(':'), s = byId.get(id);
      const a = s?.artifacts?.find(x => x.kind === kind);
      return a ? path.join(runDir, a.path) : null;
    },
    deepchordRunFor: id => byId.get(id)?.deepchordRun ?? null,
    previousArtifactDir: id => prevRecord?.steps?.find(s => s.id === id)?.deepchordRun ?? null,
    lastFeedback: () => record.feedback.at(-1) ?? (prevRecord?.feedback?.at(-1) ? {...prevRecord.feedback.at(-1), fromPrevious: true} : null),
  };

  const policy = job.policy ?? {};
  let blocked = false;
  for (const step of job.steps) {
    const key = retryKey(job.id, iteration, step);
    const entry = {id: step.id, adapter: step.adapter, action: step.action, retryKey: key, state: 'requested', startedAt: new Date().toISOString()};
    record.steps.push(entry); byId.set(step.id, entry);
    const prior = old.get(step.id);
    if (prior && prior.retryKey === key && ['verified', 'accepted'].includes(prior.state)) {
      Object.assign(entry, prior, {resumed: true}); log(`= ${step.id}: already ${prior.state} (retry key ${key}); not applied again`); await save(); continue;
    }
    if (options.signal?.aborted || existsSync(cancelFile(runDir))) { entry.state = 'cancelled'; continue; }
    if (blocked) { entry.state = 'skipped'; entry.reason = 'an earlier step was unavailable or failed'; continue; }
    const probe = record.capabilities[step.adapter] ??= await ADAPTER_IMPLS[step.adapter].probe(job);
    if (!probe.available) {
      entry.state = 'unavailable'; entry.unavailable = probe.detail; log(`! ${step.id}: unavailable — ${probe.detail}`);
      if ((policy.onUnavailable ?? 'block') === 'block') blocked = true;
      await save(); continue;
    }
    try {
      const result = await ADAPTER_IMPLS[step.adapter].run(step, {...ctxBase, workDir: path.join(runDir, 'work', step.id)});
      const {artifacts = [], ...rest} = result;
      Object.assign(entry, rest);
      entry.artifacts = [];
      for (const a of artifacts) entry.artifacts.push(await keepArtifact(runDir, step.id, a));
      if (['failed', 'unavailable'].includes(entry.state)) blocked = (policy.onUnavailable ?? 'block') === 'block' || entry.state === 'failed';
      log(`${entry.state === 'verified' ? '✓' : entry.state === 'proposed-only' ? '·' : entry.state === 'accepted' ? '~' : '!'} ${step.id} (${step.adapter} ${step.action}): ${entry.state}${entry.error ? ' — ' + entry.error : ''}${entry.unavailable ? ' — ' + entry.unavailable : ''}`);
    } catch (e) {
      if (options.signal?.aborted) entry.state = 'cancelled';
      else { entry.state = 'failed'; entry.error = e.message; blocked = true; log(`! ${step.id}: failed — ${e.message}`); }
    }
    entry.finishedAt = new Date().toISOString();
    await save();
  }
  const states = record.steps.map(s => s.state);
  record.status = states.includes('cancelled') ? 'cancelled' : states.includes('failed') ? 'failed' : states.includes('unavailable') && blocked ? 'blocked'
    : options.dryRun ? 'dry-run-completed' : 'completed';
  const problems = recordProblems(record);
  if (problems.length) { record.status = 'failed'; record.contractProblems = problems; }
  await save();
  return {runDir, record};
}

export async function loadRun(runDir) {
  return {dir: runDir, record: await readJson(path.join(runDir, 'record.json')), job: await readJson(path.join(runDir, 'job.json'))};
}

/** Store human feedback (F-004). Only this function can set audible.status to "human-heard". */
export async function addFeedback(runDir, {rating, note, heard = false, stop = false}) {
  const {record} = await loadRun(runDir);
  if (rating !== undefined && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new Error('rating must be a whole number 1–5');
  if (typeof note !== 'string' || !note.trim()) throw new Error('a feedback note is required (what to keep, what to change)');
  const entry = {at: new Date().toISOString(), ...(rating !== undefined ? {rating} : {}), note: note.trim(), heard: Boolean(heard), stop: Boolean(stop), by: 'human'};
  record.feedback.push(entry);
  if (heard) record.audible = {status: 'human-heard', at: entry.at};
  await fs.appendFile(path.join(runDir, 'feedback.jsonl'), JSON.stringify(entry) + '\n');
  record.updatedAt = entry.at;
  await writeJson(path.join(runDir, 'record.json'), record);
  return record;
}

/** Collect the chain of runs (oldest first) ending at runDir by following previousRun links. */
export async function lineage(runDir) {
  const chain = [];
  let dir = runDir;
  while (dir && existsSync(path.join(dir, 'record.json')) && chain.length < 50) { const r = await readJson(path.join(dir, 'record.json')); chain.unshift(r); dir = r.previousRun; }
  return chain;
}

/** Start the next iteration if the stopping rules allow it (F-004). */
export async function iterate(runDir, {home, dryRun = false, log} = {}) {
  const {record, job} = await loadRun(runDir);
  const decision = stopDecision(job, await lineage(runDir));
  if (decision.stop) return {started: false, decision};
  const fb = record.feedback.at(-1);
  const nextJob = {...job, intention: {...job.intention, feedbackHistory: [...(job.intention.feedbackHistory ?? []), {iteration: record.iteration, rating: fb.rating ?? null, note: fb.note}]}};
  const result = await runJob(nextJob, {home, dryRun, iteration: record.iteration + 1, previous: {dir: runDir, record}, log});
  return {started: true, decision, ...result};
}

export function summarize(record) {
  const lines = [`Run: ${record.runDir}`, `Job: ${record.jobId}  iteration ${record.iteration}  status ${record.status}${record.dryRun ? ' (dry run: nothing was changed)' : ''}`];
  for (const s of record.steps) lines.push(`  ${s.state.padEnd(13)} ${s.id} (${s.adapter} ${s.action})${s.artifacts?.length ? '  → ' + s.artifacts.map(a => a.path).join(', ') : ''}${s.error ? '  ! ' + s.error : ''}${s.unavailable ? '  ! ' + s.unavailable : ''}`);
  lines.push(`  audible output: ${record.audible.status}${record.audible.status === 'not-verified' ? ' (only you can confirm by listening)' : ''}`);
  if (record.feedback.length) lines.push(`  last feedback: ${record.feedback.at(-1).rating ?? '-'}/5 ${record.feedback.at(-1).note}`);
  return lines.join('\n');
}
export {sha256};
