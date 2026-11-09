// Optional DeepChord / Logic Pro handoff adapter (F-003).
// Uses only DeepChord's documented CLI: demo, compose, validate, feedback, logic open.
// Logic Pro is never driven directly: "logic-open" can at most reach "accepted"
// (DeepChord asked macOS to open the file). Import and audible output stay unverified.
import {spawn} from 'node:child_process';
import {promises as fs, existsSync} from 'node:fs';
import path from 'node:path';

const commandOf = ctx => ctx.job.adapters?.deepchord?.command ?? process.env.SOVAFLOW_DEEPCHORD ?? 'deepchord';

function exec(cmd, args, {timeoutMs = 600000, signal} = {}) {
  return new Promise(resolve => {
    let out = '', err = '';
    const child = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], signal, timeout: timeoutMs});
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => resolve({code: -1, out, err: err + e.message}));
    child.on('close', code => resolve({code, out, err}));
  });
}
const tail = s => s.trim().split('\n').slice(-6).join('\n').slice(-800);

async function runFolderArtifacts(dir) {
  const list = [];
  for (const [name, kind, editable] of [['composition.mid', 'midi', true], ['composition.json', 'json', true], ['validation.json', 'validation', false], ['request.json', 'request', false], ['logic-handoff.json', 'logic-handoff', false]])
    if (existsSync(path.join(dir, name))) list.push({kind, path: path.join(dir, name), editable});
  return list;
}

export const deepchord = {
  name: 'deepchord',
  async probe(job) {
    const cmd = commandOf({job});
    const r = await exec(cmd, ['--help'], {timeoutMs: 20000});
    return r.code === 0 ? {available: true, detail: `DeepChord CLI "${cmd}"`} : {available: false, detail: `DeepChord CLI "${cmd}" not runnable (${tail(r.err) || 'exit ' + r.code}). Install DeepChord, or set adapters.deepchord.command / SOVAFLOW_DEEPCHORD.`};
  },
  async run(step, ctx) {
    const cmd = commandOf(ctx), a = step.args ?? {};
    let args, dcRun = null;
    if (step.action === 'demo') { dcRun = path.join(ctx.workDir, 'deepchord-run'); args = ['demo', '--out', dcRun]; }
    else if (step.action === 'compose') {
      args = ['compose', a.prompt ?? ctx.job.intention.text, '--bars', String(a.bars ?? ctx.job.intention.bars ?? 8)];
      if (a.model) args.push('--model', a.model);
      if (a.adapter) args.push('--adapter', a.adapter);
      const prev = ctx.previousArtifactDir(step.id);
      if (prev) args.push('--previous-run', prev);
    } else if (step.action === 'validate') {
      const input = ctx.inputFor(step); args = ['validate', input ?? `(output of ${step.input})`];
    } else if (step.action === 'feedback') {
      const fb = ctx.lastFeedback();
      // Feedback given on the previous iteration belongs to that iteration's DeepChord run.
      const runDir = fb?.fromPrevious ? ctx.previousArtifactDir(a.step) : ctx.deepchordRunFor(a.step);
      args = ['feedback', runDir ?? `(DeepChord run of step ${a.step})`, '--rating', String(a.rating ?? fb?.rating ?? ''), '--note', a.note ?? fb?.note ?? ''];
      if (!fb && a.rating === undefined) return {state: 'unavailable', unavailable: 'no human feedback yet; run "sovaflow feedback RUN --rating N --note ..." first', proposed: {command: [cmd, ...args]}};
    } else if (step.action === 'logic-open') {
      const runDir = ctx.deepchordRunFor(a.step); args = ['logic', 'open', runDir ?? `(DeepChord run of step ${a.step})`];
      if (a.mcpConfig) args.push('--mcp-config', a.mcpConfig);
    } else throw new Error(`Unsupported DeepChord action ${step.action}`);

    const proposed = {command: [cmd, ...args]};
    if (ctx.dryRun) return {state: 'proposed-only', proposed};
    if (args.some(x => x.startsWith('(output of') || x.startsWith('(DeepChord run'))) return {state: 'unavailable', unavailable: 'an earlier step did not produce the needed file', proposed};
    if (dcRun) await fs.mkdir(path.dirname(dcRun), {recursive: true});
    const r = await exec(cmd, args, {signal: ctx.signal});
    if (r.code !== 0) return {state: 'failed', proposed, error: `DeepChord exited ${r.code}: ${tail(r.err || r.out)}`};

    if (step.action === 'compose') dcRun = r.out.trim().split('\n').reverse().find(l => existsSync(l.trim()))?.trim() ?? null;
    if (step.action === 'demo' || step.action === 'compose') {
      if (!dcRun || !existsSync(path.join(dcRun, 'composition.mid'))) return {state: 'accepted', proposed, accepted: {exit: 0, output: tail(r.out)}, error: 'DeepChord finished but no composition.mid was found'};
      const validation = existsSync(path.join(dcRun, 'validation.json')) ? JSON.parse(await fs.readFile(path.join(dcRun, 'validation.json'), 'utf8')) : null;
      return {state: 'verified', proposed, accepted: {exit: 0, deepchordRun: dcRun}, verified: {compositionMid: true, validationFile: Boolean(validation)}, artifacts: await runFolderArtifacts(dcRun), deepchordRun: dcRun};
    }
    if (step.action === 'logic-open') {
      const handoffFile = path.join(ctx.deepchordRunFor(a.step), 'logic-handoff.json');
      const handoff = existsSync(handoffFile) ? JSON.parse(await fs.readFile(handoffFile, 'utf8')) : null;
      // Never upgrade to "verified": opening a file is not proof of import or audible playback.
      return {state: 'accepted', proposed, accepted: {openRequested: true, handoff}, notes: ['Logic import and audible output are not verified by SovaFlow; check in Logic Pro and record it with sovaflow feedback --heard.'], artifacts: handoff ? [{kind: 'logic-handoff', path: handoffFile, editable: false}] : []};
    }
    return {state: 'verified', proposed, accepted: {exit: 0}, verified: {output: tail(r.out)}};
  },
};
