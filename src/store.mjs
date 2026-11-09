// Run storage. Everything SovaFlow creates lives under one folder (default ~/Music/SovaFlow),
// so a user can back it up, inspect it, or delete it in one place.
import {promises as fs, existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {sha256} from './contract.mjs';

export function homeDir(explicit) {
  return path.resolve(explicit || process.env.SOVAFLOW_HOME || path.join(os.homedir(), 'Music', 'SovaFlow'));
}
export const runsDir = home => path.join(home, 'runs');

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(tmp, file);
}
export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

export function newRunId(jobId, iteration) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const unique = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${jobId}-i${iteration}-${unique}`;
}

export async function createRunDir(home, jobId, iteration) {
  const dir = path.join(runsDir(home), newRunId(jobId, iteration));
  await fs.mkdir(path.join(dir, 'artifacts'), {recursive: true});
  return dir;
}

/** Copy an adapter output into the run folder (never move or edit the original) and hash it. */
export async function keepArtifact(runDir, stepId, artifact) {
  const bytes = await fs.readFile(artifact.path);
  const target = path.join(runDir, 'artifacts', stepId, path.basename(artifact.path));
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, bytes);
  return {kind: artifact.kind, path: path.relative(runDir, target), source: artifact.path, sha256: sha256(bytes), bytes: bytes.length, editable: artifact.editable !== false, ...(artifact.synthetic ? {synthetic: true} : {})};
}

export async function listRuns(home) {
  const dir = runsDir(home);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of (await fs.readdir(dir)).sort()) {
    const file = path.join(dir, name, 'record.json');
    if (existsSync(file)) { try { out.push({dir: path.join(dir, name), record: await readJson(file)}); } catch {} }
  }
  return out;
}

/** Accept a run folder path, a record.json path, or a run id under home. */
export function resolveRun(home, ref) {
  if (!ref) throw new Error('Give a run folder (see: sovaflow status).');
  const candidates = [ref, path.join(runsDir(home), ref)];
  for (const c of candidates) {
    const p = path.resolve(c);
    if (existsSync(path.join(p, 'record.json'))) return p;
    if (p.endsWith('record.json') && existsSync(p)) return path.dirname(p);
  }
  throw new Error(`No SovaFlow run found at "${ref}". List runs with: sovaflow status`);
}

export async function folderSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const e of await fs.readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await folderSize(p) : (await fs.stat(p)).size;
  }
  return total;
}
