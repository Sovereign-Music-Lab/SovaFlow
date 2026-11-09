// Optional Sovereign DAW / SovaRoll adapter (F-002).
// Talks to a SovaRoll server the user already started (`npm start` in sovaroll-DAW).
// Every write sends expectedRevision + X-Newdaw-Document, so a stale plan can never edit a changed project,
// and every applied edit is one undo step in SovaRoll's own history.
import {promises as fs} from 'node:fs';
import path from 'node:path';

const DEFAULT_URL = 'http://127.0.0.1:4317';
const urlOf = ctx => (ctx.job.adapters?.sovaroll?.url ?? process.env.SOVAFLOW_SOVAROLL_URL ?? DEFAULT_URL).replace(/\/$/, '');

async function http(base, route, {method = 'GET', headers = {}, body, timeoutMs = 20000} = {}) {
  const r = await fetch(base + route, {method, headers, body, signal: AbortSignal.timeout(timeoutMs)});
  const type = r.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return {status: r.status, data};
}
async function state(base) {
  const {status, data} = await http(base, '/api/state');
  if (status !== 200) throw new Error(`SovaRoll /api/state returned HTTP ${status}`);
  return {revision: data.project.revision, documentId: data.session?.document?.id ?? null, projectName: data.project.name, tracks: data.project.tracks.length, clips: data.project.clips.length,
    notes: data.project.clips.reduce((n, c) => n + (c.notes?.length ?? 0), 0), version: data.capabilities?.version ?? null};
}
const errorText = d => (d?.errors ?? []).map(e => `${e.code}: ${e.message}`).join('; ') || JSON.stringify(d).slice(0, 300);

export const sovaroll = {
  name: 'sovaroll',
  async probe(job) {
    const base = urlOf({job});
    try { const s = await state(base); return {available: true, detail: `SovaRoll ${s.version ?? '?'} at ${base}, project "${s.projectName}", revision ${s.revision}`}; }
    catch (e) { return {available: false, detail: `No SovaRoll server at ${base} (${e.cause?.code ?? e.message}). Start it with "npm start" in the sovaroll-DAW folder, or set adapters.sovaroll.url.`}; }
  },
  async run(step, ctx) {
    const base = urlOf(ctx), before = await state(base);
    const guard = {'X-Newdaw-Document': before.documentId};

    if (step.action === 'state') return {state: 'verified', proposed: {read: '/api/state'}, accepted: {read: true}, verified: before, revision: {before: before.revision, after: before.revision}};

    if (step.action === 'export-midi') {
      const proposed = {endpoint: '/api/export/midi?format=1', revision: before.revision};
      if (ctx.dryRun) return {state: 'proposed-only', proposed};
      const {status, data} = await http(base, '/api/export/midi?format=1', {headers: guard});
      if (status !== 200 || !Buffer.isBuffer(data) || data.toString('latin1', 0, 4) !== 'MThd') throw new Error(`MIDI export failed (HTTP ${status})`);
      const file = path.join(ctx.workDir, 'sovaroll-export.mid'); await fs.mkdir(ctx.workDir, {recursive: true}); await fs.writeFile(file, data);
      return {state: 'verified', proposed, accepted: {bytes: data.length}, verified: {smf: true, revision: before.revision}, artifacts: [{kind: 'midi', path: file, editable: true}], revision: {before: before.revision, after: before.revision}};
    }

    if (step.action === 'import-midi') {
      const input = ctx.inputFor(step);
      const name = step.args?.name ?? (input ? path.basename(input) : 'sovaflow.mid');
      const proposed = {endpoint: '/api/import/midi', name, expectedRevision: before.revision, documentId: before.documentId, input: input ?? `(output of ${step.input})`, effect: 'adds new MIDI track(s); one undo step'};
      if (ctx.dryRun || !input) return input || ctx.dryRun ? {state: 'proposed-only', proposed} : {state: 'unavailable', unavailable: `input ${step.input} has no file (was that step dry-run or skipped?)`, proposed};
      const bytes = await fs.readFile(input);
      const {status, data} = await http(base, `/api/import/midi?name=${encodeURIComponent(name)}&expectedRevision=${before.revision}`, {method: 'POST', headers: {...guard, 'Content-Type': 'audio/midi'}, body: bytes});
      if (status !== 200 || !data.applied) throw new Error(`SovaRoll rejected the MIDI import (HTTP ${status}): ${errorText(data)}`);
      const after = await state(base);
      const ok = after.revision === data.projectRevision && after.clips > before.clips;
      return {state: ok ? 'verified' : 'accepted', proposed, accepted: {projectRevision: data.projectRevision, applied: true}, ...(ok ? {verified: {revision: after.revision, addedClips: after.clips - before.clips, addedTracks: after.tracks - before.tracks, notes: after.notes}} : {}), revision: {before: before.revision, after: data.projectRevision, observed: after.revision}, undoable: true};
    }

    if (step.action === 'command') {
      const {command, arguments: args = {}} = step.args ?? {};
      if (typeof command !== 'string') throw new Error('sovaroll command step needs args.command (and optional args.arguments)');
      const body = extra => JSON.stringify({command, arguments: args, expectedRevision: before.revision, ...extra});
      const dry = await http(base, '/api/command', {method: 'POST', headers: {...guard, 'Content-Type': 'application/json'}, body: body({dryRun: true})});
      if (dry.status !== 200 || dry.data.status !== 'validated') return {state: 'failed', proposed: {command, arguments: args}, error: `SovaRoll validation rejected the command: ${errorText(dry.data)}`};
      const proposed = {command, arguments: args, expectedRevision: before.revision, validation: 'SovaRoll dry-run validated', changes: dry.data.changes};
      if (ctx.dryRun) return {state: 'proposed-only', proposed};
      const real = await http(base, '/api/command', {method: 'POST', headers: {...guard, 'Content-Type': 'application/json'}, body: body({})});
      if (real.status !== 200 || !real.data.applied) throw new Error(`SovaRoll rejected the command (HTTP ${real.status}): ${errorText(real.data)}`);
      const after = await state(base);
      const ok = after.revision === real.data.projectRevision;
      return {state: ok ? 'verified' : 'accepted', proposed, accepted: {projectRevision: real.data.projectRevision}, ...(ok ? {verified: {revision: after.revision}} : {}), revision: {before: before.revision, after: real.data.projectRevision, observed: after.revision}, undoable: true};
    }

    if (step.action === 'undo') {
      const target = ctx.stepRecord(step.args?.step);
      if (!target?.undoable || !target?.revision?.after) return {state: 'unavailable', unavailable: `undo needs args.step pointing to an applied SovaRoll edit (import-midi or command) in this run (got "${step.args?.step}")`};
      const proposed = {undo: step.args.step, requireRevision: target.revision.after};
      if (before.revision !== target.revision.after) return {state: 'failed', proposed, error: `Project changed since step "${step.args.step}" (revision ${before.revision}, expected ${target.revision.after}). Not undoing someone else's edit.`};
      if (ctx.dryRun) return {state: 'proposed-only', proposed};
      const real = await http(base, '/api/command', {method: 'POST', headers: {...guard, 'Content-Type': 'application/json'}, body: JSON.stringify({command: 'history.undo', arguments: {}, expectedRevision: before.revision})});
      if (real.status !== 200 || !real.data.applied) throw new Error(`SovaRoll undo rejected: ${errorText(real.data)}`);
      const after = await state(base);
      return {state: 'verified', proposed, accepted: {projectRevision: real.data.projectRevision}, verified: {revision: after.revision, clips: after.clips}, revision: {before: before.revision, after: after.revision}};
    }
    throw new Error(`Unsupported SovaRoll action ${step.action}`);
  },
};
