import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs, existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {jobProblems, recordProblems, retryKey, stopDecision, canonical} from '../src/contract.mjs';
import {runJob, addFeedback, iterate, lineage, loadRun, requestCancel} from '../src/runner.mjs';
import {countNotes} from '../src/midi.mjs';
import {startFakeSovaroll} from './fixtures/fake-sovaroll.mjs';

const exec = promisify(execFile), ROOT = path.resolve(import.meta.dirname, '..');
const FAKE_DC = path.join(ROOT, 'tests/fixtures/fake-deepchord.mjs');
const tmp = async t => { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'sovaflow-test-')); t.after(() => fs.rm(d, {recursive: true, force: true})); return d; };
const job = (steps, extra = {}) => ({schema: 'sovaflow.job/1', id: 'test-job', intention: {text: 'test intention', bars: 2}, steps, ...extra});
const synth = job([{id: 'compose', adapter: 'synthetic', action: 'compose'}], {policy: {maxIterations: 3, targetRating: 4}});
const cli = (...args) => exec(process.execPath, [path.join(ROOT, 'bin/sovaflow.mjs'), ...args], {env: {...process.env, LANG: 'en_US.UTF-8'}});

test('F-001 contract: valid examples pass and every malformed field is reported', async () => {
  for (const f of (await fs.readdir(path.join(ROOT, 'examples')))) assert.deepEqual(jobProblems(JSON.parse(await fs.readFile(path.join(ROOT, 'examples', f), 'utf8'))), [], f);
  const bad = jobProblems({schema: 'x', id: 'bad id!', intention: {}, adapters: {sovaroll: {url: 'http://example.com'}}, steps: [{id: 'a', adapter: 'sovaroll', action: 'explode'}, {id: 'a', adapter: 'nope', action: 'x'}, {id: 'c', adapter: 'synthetic', action: 'compose', input: 'later:midi'}], policy: {maxIterations: 99}});
  for (const needle of ['schema', 'id must', 'intention.text', 'local address', 'not supported by sovaroll', 'duplicated', 'adapter must be one of', 'earlier step', 'maxIterations']) assert.ok(bad.some(p => p.includes(needle)), needle);
});

test('F-001 contract: retry identity is stable and argument-sensitive; records reject unproven claims', () => {
  const s = {id: 'x', adapter: 'synthetic', action: 'compose', args: {b: 1, a: 2}};
  assert.equal(retryKey('j', 1, s), retryKey('j', 1, {...s, args: {a: 2, b: 1}}));
  assert.notEqual(retryKey('j', 1, s), retryKey('j', 2, s));
  assert.equal(canonical({b: 1, a: [2, {d: 1, c: 0}]}), '{"a":[2,{"c":0,"d":1}],"b":1}');
  const base = {schema: 'sovaflow.record/1', status: 'completed', iteration: 1, audible: {status: 'not-verified'}, feedback: [], steps: []};
  assert.deepEqual(recordProblems(base), []);
  assert.ok(recordProblems({...base, audible: {status: 'human-heard'}}).some(p => p.includes('heard=true')));
  assert.ok(recordProblems({...base, steps: [{state: 'verified'}]}).some(p => p.includes('no verified evidence')));
  assert.ok(recordProblems({...base, steps: [{state: 'unavailable'}]}).some(p => p.includes('no reason')));
});

test('synthetic run writes an editable MIDI artifact with hash; dry run writes no artifact', async t => {
  const home = await tmp(t);
  const dry = await runJob(synth, {home, dryRun: true});
  assert.equal(dry.record.status, 'dry-run-completed'); assert.equal(dry.record.steps[0].state, 'proposed-only'); assert.deepEqual(dry.record.steps[0].artifacts, []);
  const real = await runJob(synth, {home});
  assert.equal(real.record.status, 'completed');
  const a = real.record.steps[0].artifacts[0];
  assert.equal(a.kind, 'midi'); assert.equal(a.synthetic, true); assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.equal(countNotes(await fs.readFile(path.join(real.runDir, a.path))), 8);
  assert.equal(real.record.audible.status, 'not-verified');
  assert.notEqual(dry.runDir, real.runDir);
});

test('F-004 feedback loop: iterate until target rating, human-heard only from feedback, stop rules', async t => {
  const home = await tmp(t);
  const first = await runJob(synth, {home});
  assert.equal((await iterate(first.runDir, {home})).decision.reason.startsWith('waiting for human feedback'), true);
  await addFeedback(first.runDir, {rating: 2, note: 'too busy, simplify the left hand'});
  const second = await iterate(first.runDir, {home});
  assert.equal(second.started, true); assert.equal(second.record.iteration, 2); assert.equal(second.record.previousRun, first.runDir);
  assert.equal((await loadRun(second.runDir)).job.intention.feedbackHistory[0].note, 'too busy, simplify the left hand');
  await addFeedback(second.runDir, {rating: 4, note: 'good', heard: true});
  assert.equal((await loadRun(second.runDir)).record.audible.status, 'human-heard');
  const done = await iterate(second.runDir, {home});
  assert.equal(done.started, false); assert.match(done.decision.reason, /reached target/);
  assert.equal((await lineage(second.runDir)).length, 2);
  await assert.rejects(addFeedback(second.runDir, {rating: 9, note: 'x'}), /1–5/);
  await assert.rejects(addFeedback(second.runDir, {rating: 3, note: ' '}), /note/);
  assert.match(stopDecision({policy: {maxIterations: 1}}, [{iteration: 1, status: 'completed', feedback: [{rating: 1, note: 'x'}]}]).reason, /maxIterations/);
  assert.match(stopDecision({}, [{iteration: 1, status: 'completed', feedback: [{rating: 1, note: 'x', stop: true}]}]).reason, /human asked/);
});

test('F-002 SovaRoll adapter: state → import (verified) → export → undo, with revision and document guards', async t => {
  const home = await tmp(t), fake = await startFakeSovaroll(); t.after(fake.close);
  const j = job([
    {id: 'compose', adapter: 'synthetic', action: 'compose'},
    {id: 'state', adapter: 'sovaroll', action: 'state'},
    {id: 'import', adapter: 'sovaroll', action: 'import-midi', input: 'compose:midi'},
    {id: 'export', adapter: 'sovaroll', action: 'export-midi'},
    {id: 'undo', adapter: 'sovaroll', action: 'undo', args: {step: 'import'}},
  ], {adapters: {sovaroll: {url: fake.url}}});
  const dry = await runJob(j, {home, dryRun: true});
  assert.equal(fake.project.revision, 0, 'dry run changes nothing');
  assert.equal(dry.record.steps.find(s => s.id === 'import').state, 'proposed-only');
  const {record} = await runJob(j, {home});
  const by = id => record.steps.find(s => s.id === id);
  assert.equal(record.status, 'completed', JSON.stringify(record.steps.map(s => [s.id, s.state, s.error])));
  assert.equal(by('import').revision.before, 0); assert.equal(by('import').revision.after, 1); assert.equal(by('import').verified.addedClips, 1);
  assert.equal(by('export').artifacts[0].kind, 'midi');
  assert.equal(by('undo').state, 'verified'); assert.equal(fake.project.clips.length, 0);
  const importCall = fake.calls.find(c => c.path === '/api/import/midi');
  assert.equal(importCall.query.expectedRevision, '0'); assert.equal(importCall.doc, 'doc-fake-1');
});

test('F-002 SovaRoll: commands are validated first; undo refuses non-edits and edits made by someone else', async t => {
  const home = await tmp(t), fake = await startFakeSovaroll(); t.after(fake.close);
  const rename = {id: 'rename', adapter: 'sovaroll', action: 'command', args: {command: 'project.rename', arguments: {name: 'New'}}};
  const undo = {id: 'undo', adapter: 'sovaroll', action: 'undo', args: {step: 'rename'}};
  const ok = await runJob(job([rename, undo], {adapters: {sovaroll: {url: fake.url}}}), {home});
  assert.deepEqual(ok.record.steps.map(s => s.state), ['verified', 'verified']);
  assert.equal(fake.project.name, 'Fake', 'undo restored the name');
  const dryCalls = fake.calls.filter(c => c.path === '/api/command').length;
  assert.ok(dryCalls >= 3, 'dry-run validation call precedes the real command');
  const bad = await runJob(job([{id: 'x', adapter: 'sovaroll', action: 'command', args: {command: 'nuke.everything'}}], {adapters: {sovaroll: {url: fake.url}}}), {home});
  assert.equal(bad.record.steps[0].state, 'failed'); assert.match(bad.record.steps[0].error, /validation rejected/);
  const notEdit = await runJob(job([{id: 'rename', adapter: 'sovaroll', action: 'state'}, undo], {adapters: {sovaroll: {url: fake.url}}, policy: {onUnavailable: 'skip'}}), {home});
  assert.equal(notEdit.record.steps[1].state, 'unavailable', 'a read step cannot be undone');
  const busy = await startFakeSovaroll({externalEditAfterApply: true}); t.after(busy.close);
  const raced = await runJob(job([rename, undo], {adapters: {sovaroll: {url: busy.url}}}), {home});
  assert.equal(raced.record.steps[1].state, 'failed'); assert.match(raced.record.steps[1].error, /Project changed/);
  assert.equal(busy.project.name, 'New', 'the other edit and the rename are left alone');
});

test('unavailable app is recorded honestly and blocks later steps; resume never re-applies verified edits', async t => {
  const home = await tmp(t);
  const off = await runJob(job([{id: 'compose', adapter: 'synthetic', action: 'compose'}, {id: 'import', adapter: 'sovaroll', action: 'import-midi', input: 'compose:midi'}, {id: 'export', adapter: 'sovaroll', action: 'export-midi'}], {adapters: {sovaroll: {url: 'http://127.0.0.1:9'}}}), {home});
  assert.equal(off.record.status, 'blocked');
  assert.deepEqual(off.record.steps.map(s => s.state), ['verified', 'unavailable', 'skipped']);
  assert.match(off.record.steps[1].unavailable, /No SovaRoll server/);
  const fake = await startFakeSovaroll(); t.after(fake.close);
  const j = job([{id: 'compose', adapter: 'synthetic', action: 'compose'}, {id: 'import', adapter: 'sovaroll', action: 'import-midi', input: 'compose:midi'}], {adapters: {sovaroll: {url: fake.url}}});
  const first = await runJob(j, {home});
  assert.equal(fake.project.revision, 1);
  const resumed = await runJob(j, {home, resume: await loadRun(first.runDir)});
  assert.equal(fake.project.revision, 1, 'import not applied twice');
  assert.equal(resumed.record.steps[1].resumed, true);
});

test('cancellation stops before the next step and is recorded', async t => {
  const home = await tmp(t);
  const controller = new AbortController(); controller.abort();
  const {record} = await runJob(synth, {home, signal: controller.signal});
  assert.equal(record.status, 'cancelled'); assert.equal(record.steps[0].state, 'cancelled');
  const ok = await runJob(synth, {home}); await requestCancel(ok.runDir);
  assert.ok(existsSync(path.join(ok.runDir, 'CANCEL')));
});

test('F-003 DeepChord adapter: demo artifacts, compose with previous run, feedback forwarding, Logic open stays "accepted"', async t => {
  const home = await tmp(t), runs = await tmp(t), logFile = path.join(runs, 'calls.jsonl');
  process.env.FAKE_DEEPCHORD_RUNS = runs; process.env.FAKE_DEEPCHORD_LOG = logFile;
  t.after(() => { delete process.env.FAKE_DEEPCHORD_RUNS; delete process.env.FAKE_DEEPCHORD_LOG; });
  const j = job([
    {id: 'compose', adapter: 'deepchord', action: 'compose', args: {model: 'm'}},
    {id: 'logic', adapter: 'deepchord', action: 'logic-open', args: {step: 'compose'}},
    {id: 'fb', adapter: 'deepchord', action: 'feedback', args: {step: 'compose'}},
  ], {adapters: {deepchord: {command: FAKE_DC}}, policy: {onUnavailable: 'skip', maxIterations: 3, targetRating: 5}});
  const first = await runJob(j, {home});
  const by = (r, id) => r.steps.find(s => s.id === id);
  assert.equal(by(first.record, 'compose').state, 'verified');
  assert.ok(by(first.record, 'compose').artifacts.some(a => a.kind === 'midi' && a.editable));
  assert.equal(by(first.record, 'logic').state, 'accepted', 'opening Logic is never "verified"');
  assert.equal(by(first.record, 'fb').state, 'unavailable', 'no human feedback yet');
  await addFeedback(first.runDir, {rating: 3, note: 'more space in bar 2'});
  const second = await iterate(first.runDir, {home});
  const calls = (await fs.readFile(logFile, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  const compose2 = calls.filter(c => c[0] === 'compose')[1];
  assert.equal(compose2[compose2.indexOf('--previous-run') + 1], by(first.record, 'compose').deepchordRun);
  assert.equal(by(second.record, 'fb').state, 'verified');
  assert.match(await fs.readFile(path.join(by(first.record, 'compose').deepchordRun, 'feedback.jsonl'), 'utf8'), /more space in bar 2/);
  const missing = await runJob(job([{id: 'd', adapter: 'deepchord', action: 'demo'}], {adapters: {deepchord: {command: '/nonexistent/deepchord'}}}), {home});
  assert.equal(missing.record.steps[0].state, 'unavailable');
});

test('CLI: help, validate, run, status, feedback, iterate and remove-data work end to end', async t => {
  const home = await tmp(t);
  assert.match((await cli('help')).stdout, /sovaflow run JOB/);
  assert.match((await cli('help', '--lang', 'ko')).stdout, /작업 실행/);
  assert.match((await cli('validate', path.join(ROOT, 'examples/synthetic-loop.job.json'))).stdout, /VALID/);
  const run = await cli('run', 'synthetic-loop', '--home', home);
  assert.match(run.stdout, /status completed/);
  const runDir = run.stdout.match(/Run: (.+)/)[1].trim();
  assert.match((await cli('status', '--home', home)).stdout, /completed/);
  assert.match((await cli('feedback', runDir, '--rating', '2', '--note', 'brighter', '--home', home)).stdout, /below target/);
  assert.match((await cli('iterate', runDir, '--home', home)).stdout, /iteration 2/);
  assert.match((await cli('remove-data', '--home', home)).stdout, /Add --yes/);
  await cli('remove-data', '--yes', '--home', home);
  assert.equal(existsSync(home), false);
});
