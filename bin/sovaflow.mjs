#!/usr/bin/env node
// SovaFlow command line. Run "sovaflow help" (or "node bin/sovaflow.mjs help").
import {promises as fs, existsSync} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {jobProblems, recordProblems, JOB_SCHEMA, RECORD_SCHEMA, stopDecision} from '../src/contract.mjs';
import {homeDir, listRuns, resolveRun, readJson, folderSize} from '../src/store.mjs';
import {runJob, loadRun, addFeedback, iterate, requestCancel, probeAll, lineage, summarize, VERSION} from '../src/runner.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const next = argv[i + 1]; if (next !== undefined && !next.startsWith('--') && !['dry-run', 'heard', 'stop', 'yes', 'json'].includes(k)) { flags[k] = next; i++; } else flags[k] = true; }
  else pos.push(a);
}
const KO = (flags.lang ?? process.env.SOVAFLOW_LANG ?? process.env.LANG ?? '').toString().toLowerCase().startsWith('ko');
const t = (en, ko) => KO ? ko : en;
const home = homeDir(flags.home);
const print = s => process.stdout.write(s + '\n');
const out = obj => print(flags.json ? JSON.stringify(obj, null, 2) : typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
const exampleDir = path.join(ROOT, 'examples');

async function loadJob(file) {
  const p = existsSync(file) ? file : existsSync(path.join(exampleDir, file)) ? path.join(exampleDir, file) : existsSync(path.join(exampleDir, file + '.job.json')) ? path.join(exampleDir, file + '.job.json') : file;
  return readJson(p);
}

const HELP = () => t(`SovaFlow ${VERSION} — connect DeepChord, Sovereign DAW (SovaRoll) and your feedback.

Everyday:
  sovaflow menu                         Guided menu (easiest)
  sovaflow doctor [JOB]                 Check which apps SovaFlow can reach right now
  sovaflow examples                     List ready-made jobs
  sovaflow run JOB [--dry-run]          Run a job (--dry-run shows the plan and changes nothing)
  sovaflow status [RUN]                 List runs, or show one run in detail
  sovaflow feedback RUN --rating 1-5 --note "..." [--heard] [--stop]
  sovaflow iterate RUN [--dry-run]      Start the next version if your feedback asks for it
Also:
  sovaflow validate FILE                Check a job or record file against the contract
  sovaflow resume RUN                   Continue an interrupted run (never re-applies finished edits)
  sovaflow cancel RUN                   Ask a running job to stop before its next step
  sovaflow where                        Show where your runs are stored
  sovaflow remove-data --yes            Delete all SovaFlow runs (your DAW projects are not touched)
Options: --home DIR (default ~/Music/SovaFlow) · --lang ko|en · --json`,
`SovaFlow ${VERSION} — DeepChord, Sovereign DAW(SovaRoll), 사람의 피드백을 연결합니다.

자주 쓰는 명령:
  sovaflow menu                         안내 메뉴 (가장 쉬움)
  sovaflow doctor [작업]                지금 연결 가능한 프로그램 점검
  sovaflow examples                     준비된 작업 목록
  sovaflow run 작업 [--dry-run]          작업 실행 (--dry-run은 계획만 보여 주고 아무것도 바꾸지 않음)
  sovaflow status [실행]                실행 목록 또는 한 실행의 자세한 기록
  sovaflow feedback 실행 --rating 1-5 --note "..." [--heard] [--stop]
  sovaflow iterate 실행 [--dry-run]      피드백에 따라 다음 버전 만들기
그 밖에:
  sovaflow validate 파일                작업/기록 파일이 계약에 맞는지 검사
  sovaflow resume 실행                  중단된 실행 이어가기 (끝난 편집은 다시 적용하지 않음)
  sovaflow cancel 실행                  실행 중인 작업을 다음 단계 전에 멈춤
  sovaflow where                        실행 기록 저장 위치
  sovaflow remove-data --yes            SovaFlow 실행 기록 전체 삭제 (DAW 프로젝트는 건드리지 않음)
옵션: --home 폴더 (기본 ~/Music/SovaFlow) · --lang ko|en · --json`);

async function doctor(jobFile) {
  const job = jobFile ? await loadJob(jobFile) : null;
  const major = Number(process.versions.node.split('.')[0]);
  print(`${major >= 22 ? '✓' : '✗'} Node.js ${process.versions.node}${major >= 22 ? '' : t(' — SovaFlow needs Node.js 22 or newer', ' — Node.js 22 이상이 필요합니다')}`);
  print(`✓ ${t('Runs folder', '실행 기록 폴더')}: ${home}`);
  const probes = await probeAll(job);
  for (const [name, p] of Object.entries(probes)) print(`${p.available ? '✓' : '–'} ${name}: ${p.detail}`);
  const logic = ['/Applications/Logic Pro.app', '/Applications/Logic Pro X.app'].find(p => existsSync(p));
  print(`${logic ? '✓' : '–'} Logic Pro: ${logic ? t(`installed (${logic}); reached only through DeepChord, never controlled directly`, `설치됨 (${logic}); DeepChord를 통해서만 연결하며 직접 조작하지 않음`) : t('not found (optional)', '없음 (선택 사항)')}`);
  print(t('Unavailable apps are recorded as unavailable — SovaFlow never pretends they worked.', '없는 프로그램은 "unavailable"로 기록하며, 된 것처럼 꾸미지 않습니다.'));
  return probes;
}

async function examples() {
  const files = (await fs.readdir(exampleDir)).filter(f => f.endsWith('.job.json')).sort();
  for (const f of files) { const j = await readJson(path.join(exampleDir, f)); print(`${f.replace('.job.json', '').padEnd(28)} ${j.title ?? ''}\n${' '.repeat(29)}${t('needs', '필요')}: ${[...new Set(j.steps.map(s => s.adapter))].join(', ')}`); }
  print(t('\nRun one with: sovaflow run NAME --dry-run   (then without --dry-run)', '\n실행: sovaflow run 이름 --dry-run   (확인 후 --dry-run 없이)'));
  return files;
}

async function run(jobFile, {dryRun}) {
  const job = await loadJob(jobFile);
  const problems = jobProblems(job);
  if (problems.length) { print(t('This job file is not valid:', '작업 파일이 올바르지 않습니다:')); problems.forEach(p => print('  - ' + p)); process.exitCode = 1; return; }
  const controller = new AbortController();
  const onInt = () => { print(t('\nStopping after the current step…', '\n현재 단계가 끝나면 멈춥니다…')); controller.abort(); };
  process.once('SIGINT', onInt);
  const {record} = await runJob(job, {home, dryRun, signal: controller.signal, log: print});
  process.off('SIGINT', onInt);
  print('\n' + summarize(record));
  if (record.status === 'completed') print(t(`\nNext: listen, then  sovaflow feedback "${record.runDir}" --rating 1-5 --note "what to keep / change" [--heard]`, `\n다음: 들어 본 뒤  sovaflow feedback "${record.runDir}" --rating 1-5 --note "유지할 점 / 바꿀 점" [--heard]`));
  if (record.status === 'blocked') print(t('\nA needed app is not available. Run: sovaflow doctor', '\n필요한 프로그램을 쓸 수 없습니다. 점검: sovaflow doctor'));
  if (['failed', 'blocked', 'cancelled'].includes(record.status)) process.exitCode = 1;
  return record;
}

async function status(ref) {
  if (ref) { const {record} = await loadRun(resolveRun(home, ref)); out(flags.json ? record : summarize(record)); return record; }
  const runs = await listRuns(home);
  if (!runs.length) { print(t(`No runs yet in ${home}. Try: sovaflow run synthetic-loop --dry-run`, `${home}에 실행 기록이 없습니다. 시작: sovaflow run synthetic-loop --dry-run`)); return []; }
  for (const r of runs) print(`${path.basename(r.dir)}  ${r.record.status.padEnd(17)} ${r.record.feedback.at(-1)?.rating ? '★' + r.record.feedback.at(-1).rating : '  '}  ${r.record.title ?? r.record.jobId}`);
  return runs;
}

async function menu() {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  const ask = async q => (await rl.question(q)).trim();
  try {
    for (;;) {
      print(t(`\nSovaFlow menu  (runs are saved in ${home})
  1) Check my setup
  2) Try the built-in example (no other apps needed)
  3) Send a DeepChord sketch into SovaRoll (both must be running/installed)
  4) Show my runs
  5) Give feedback on the latest run
  6) Make the next version from my feedback
  7) Help (all commands)
  0) Quit`, `\nSovaFlow 메뉴  (실행 기록 위치: ${home})
  1) 설치 상태 점검
  2) 내장 예제 실행 (다른 프로그램 필요 없음)
  3) DeepChord 스케치를 SovaRoll로 보내기 (둘 다 설치·실행 필요)
  4) 내 실행 기록 보기
  5) 가장 최근 실행에 피드백 남기기
  6) 피드백으로 다음 버전 만들기
  7) 도움말 (모든 명령)
  0) 끝내기`));
      const c = await ask(t('Choose a number: ', '번호를 고르세요: '));
      const latest = async () => (await listRuns(home)).at(-1)?.dir;
      if (c === '0' || c === '') return;
      if (c === '1') await doctor();
      if (c === '2') await run('synthetic-loop', {dryRun: false});
      if (c === '3') { await run('deepchord-to-sovaroll', {dryRun: true}); if ((await ask(t('Apply this plan for real? (y/N) ', '이 계획을 실제로 적용할까요? (y/N) '))).toLowerCase() === 'y') await run('deepchord-to-sovaroll', {dryRun: false}); }
      if (c === '4') await status();
      if (c === '5') {
        const dir = await latest(); if (!dir) { print(t('No run yet.', '실행 기록이 없습니다.')); continue; }
        const rating = Number(await ask(t('Rating 1–5: ', '점수 1–5: ')));
        const note = await ask(t('What should stay, what should change? ', '유지할 점과 바꿀 점은? '));
        const heard = (await ask(t('Did you actually listen to it? (y/N) ', '실제로 들어 보셨나요? (y/N) '))).toLowerCase() === 'y';
        const stop = (await ask(t('Is it good enough to stop? (y/N) ', '이대로 마칠까요? (y/N) '))).toLowerCase() === 'y';
        try { await addFeedback(dir, {rating, note, heard, stop}); print(t('Saved.', '저장했습니다.')); } catch (e) { print('! ' + e.message); }
      }
      if (c === '6') { const dir = await latest(); if (dir) await doIterate(dir, false); }
      if (c === '7') print(HELP());
    }
  } catch (e) { if (!/readline was closed/.test(e.message)) throw e; } // input ended (Ctrl+D or piped input)
  finally { rl.close(); }
}

async function doIterate(dir, dryRun) {
  const r = await iterate(dir, {home, dryRun, log: print});
  if (!r.started) { print(t(`Not starting a new version: ${r.decision.reason}`, `새 버전을 만들지 않습니다: ${r.decision.reason}`)); return r; }
  print('\n' + summarize(r.record)); return r;
}

const [cmd = 'help', a1] = pos;
try {
  if (flags.version || cmd === 'version') print(VERSION);
  else if (cmd === 'help' || flags.help) print(HELP());
  else if (cmd === 'doctor') await doctor(a1);
  else if (cmd === 'examples') await examples();
  else if (cmd === 'run') { if (!a1) throw new Error(t('Which job? Try: sovaflow examples', '어떤 작업인가요? 목록: sovaflow examples')); await run(a1, {dryRun: Boolean(flags['dry-run'])}); }
  else if (cmd === 'status') await status(a1);
  else if (cmd === 'validate') {
    const doc = await readJson(a1); const problems = doc.schema === RECORD_SCHEMA ? recordProblems(doc) : jobProblems(doc);
    if (problems.length) { print(t('INVALID', '올바르지 않음')); problems.forEach(p => print('  - ' + p)); process.exitCode = 1; } else print(`VALID ${doc.schema ?? JOB_SCHEMA}`);
  }
  else if (cmd === 'feedback') {
    const dir = resolveRun(home, a1);
    const rec = await addFeedback(dir, {rating: flags.rating === undefined ? undefined : Number(flags.rating), note: flags.note, heard: Boolean(flags.heard), stop: Boolean(flags.stop)});
    const {job} = await loadRun(dir);
    print(t('Feedback saved.', '피드백을 저장했습니다.') + ' ' + stopDecision(job, await lineage(dir)).reason);
    if (flags.json) out(rec);
  }
  else if (cmd === 'iterate') await doIterate(resolveRun(home, a1), Boolean(flags['dry-run']));
  else if (cmd === 'resume') { const run = await loadRun(resolveRun(home, a1)); const {record} = await runJob(run.job, {home, resume: run, log: print}); print('\n' + summarize(record)); }
  else if (cmd === 'cancel') { await requestCancel(resolveRun(home, a1)); print(t('Cancel requested; the run stops before its next step.', '취소를 요청했습니다. 다음 단계 전에 멈춥니다.')); }
  else if (cmd === 'where') print(home);
  else if (cmd === 'remove-data') {
    const size = await folderSize(home);
    if (!flags.yes) { print(t(`This would delete ${home} (${(size / 1e6).toFixed(1)} MB of SovaFlow runs). Your SovaRoll projects, DeepChord runs and Logic projects are elsewhere and are not touched. Add --yes to delete.`, `${home} (${(size / 1e6).toFixed(1)} MB의 SovaFlow 실행 기록)를 지웁니다. SovaRoll 프로젝트, DeepChord 결과, Logic 프로젝트는 다른 곳에 있어 지워지지 않습니다. 지우려면 --yes를 붙이세요.`)); }
    else { await fs.rm(home, {recursive: true, force: true}); print(t(`Deleted ${home}.`, `${home}를 지웠습니다.`)); }
  }
  else if (cmd === 'menu') await menu();
  else { print(t(`Unknown command "${cmd}".`, `알 수 없는 명령 "${cmd}".`)); print(HELP()); process.exitCode = 2; }
} catch (e) {
  print('! ' + e.message); process.exitCode = 1;
}
