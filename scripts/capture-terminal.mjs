// Render REAL SovaFlow command output as terminal images for the README.
// Optional tool for maintainers (needs an external Playwright + Chrome):
//   SOVAFLOW_PLAYWRIGHT=/abs/playwright/index.mjs node scripts/capture-terminal.mjs
// For the DeepChord → SovaRoll image, also start SovaRoll and set:
//   SOVAFLOW_DEEPCHORD=/abs/deepchord  SOVAFLOW_SOVAROLL_URL=http://127.0.0.1:PORT
import {promises as fs, existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec = promisify(execFile), root = path.resolve(import.meta.dirname, '..');
const npx = path.join(os.homedir(), '.npm/_npx');
const candidates = [process.env.SOVAFLOW_PLAYWRIGHT, ...(existsSync(npx) ? (await fs.readdir(npx)).map(d => path.join(npx, d, 'node_modules/playwright/index.mjs')) : [])].filter(Boolean);
const pw = candidates.find(c => existsSync(c));
if (!pw) { console.log('Playwright not found; set SOVAFLOW_PLAYWRIGHT.'); process.exit(2); }
const {chromium} = await import(pw);
const home = '/tmp/SovaFlow-demo'; await fs.rm(home, {recursive: true, force: true});
const out = path.join(root, 'docs/images'); await fs.mkdir(out, {recursive: true});
const sf = async (args, {lang = 'en', input} = {}) => {
  const env = {...process.env, LANG: lang === 'ko' ? 'ko_KR.UTF-8' : 'en_US.UTF-8', SOVAFLOW_HOME: home};
  if (input !== undefined) {
    const {spawn} = await import('node:child_process');
    return new Promise(res => { const c = spawn(process.execPath, ['bin/sovaflow.mjs', ...args], {cwd: root, env}); let o = ''; c.stdout.on('data', d => { o += d; }); c.stderr.on('data', d => { o += d; }); c.on('close', () => res(o)); c.stdin.end(input); });
  }
  try { return (await exec(process.execPath, ['bin/sovaflow.mjs', ...args], {cwd: root, env, timeout: 120000})).stdout; } catch (e) { return (e.stdout ?? '') + (e.stderr ?? ''); }
};
const browser = await chromium.launch({headless: true, channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1100, height: 400}});
const shot = async (name, cmd, text) => {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lines = text.trimEnd().split('\n'), shown = lines.slice(0, 40).join('\n') + (lines.length > 40 ? `\n… (${lines.length - 40} more lines)` : '');
  await page.setContent(`<body style="margin:0;background:#1e1f22"><div id="t" style="display:inline-block;min-width:1000px;max-width:1080px;margin:16px;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px #0008;font:13px/1.45 Menlo,'Apple SD Gothic Neo',monospace">
    <div style="background:#2d2f34;padding:8px 12px;color:#aaa;font:12px system-ui"><span style="color:#ff5f56">●</span> <span style="color:#ffbd2e">●</span> <span style="color:#27c93f">●</span> &nbsp; Terminal — SovaFlow</div>
    <pre style="margin:0;padding:14px 16px;background:#141518;color:#e6e6e6;white-space:pre-wrap"><span style="color:#7ee787">$</span> ${esc(cmd)}\n${esc(shown)}</pre></div></body>`);
  await page.locator('#t').screenshot({path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 85});
  console.log('captured', name);
};
try {
  await shot('01-help', 'sovaflow help', await sf(['help']));
  await shot('02-help-ko', 'sovaflow help --lang ko', await sf(['help'], {lang: 'ko'}));
  await shot('03-doctor', 'sovaflow doctor', await sf(['doctor', ...(process.env.SOVAFLOW_SOVAROLL_URL ? [] : [])]));
  await shot('04-examples', 'sovaflow examples', await sf(['examples']));
  const dry = await sf(['run', 'synthetic-loop', '--dry-run']);
  await shot('05-dry-run', 'sovaflow run synthetic-loop --dry-run', dry);
  const run = await sf(['run', 'synthetic-loop']);
  await shot('06-run', 'sovaflow run synthetic-loop', run);
  const runDir = run.match(/Run: (.+)/)[1].trim();
  await shot('07-feedback', `sovaflow feedback "${path.basename(runDir)}" --rating 3 --note "more space in bar 2" --heard`, await sf(['feedback', path.basename(runDir), '--rating', '3', '--note', 'more space in bar 2', '--heard']));
  await shot('08-iterate', `sovaflow iterate "${path.basename(runDir)}"`, await sf(['iterate', path.basename(runDir)]));
  await shot('09-status', 'sovaflow status', await sf(['status']));
  await shot('10-menu-ko', 'sovaflow menu --lang ko   (4 → 0 입력)', await sf(['menu'], {lang: 'ko', input: '4\n0\n'}));
  if (process.env.SOVAFLOW_DEEPCHORD && process.env.SOVAFLOW_SOVAROLL_URL) {
    const job = JSON.parse(await fs.readFile(path.join(root, 'examples/deepchord-to-sovaroll.job.json'), 'utf8'));
    job.adapters = {sovaroll: {url: process.env.SOVAFLOW_SOVAROLL_URL}};
    const file = path.join(home, 'deepchord-to-sovaroll.job.json'); await fs.writeFile(file, JSON.stringify(job));
    await shot('11-real-dry-run', 'sovaflow run deepchord-to-sovaroll --dry-run', await sf(['run', file, '--dry-run']));
    await shot('12-real-run', 'sovaflow run deepchord-to-sovaroll', await sf(['run', file]));
  }
} finally { await browser.close(); await fs.rm(home, {recursive: true, force: true}); }
