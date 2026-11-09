#!/usr/bin/env node
// Test double for the DeepChord CLI (demo/compose/validate/feedback/logic open). Used only by tests.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {writeSmf} from '../../src/midi.mjs';
const [cmd, ...rest] = process.argv.slice(2);
const log = process.env.FAKE_DEEPCHORD_LOG;
if (log) await fs.appendFile(log, JSON.stringify([cmd, ...rest]) + '\n');
async function makeRun(dir) {
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'composition.mid'), writeSmf([{pitch: 62, startTick: 0, durationTicks: 480}, {pitch: 65, startTick: 480, durationTicks: 480}]));
  await fs.writeFile(path.join(dir, 'composition.json'), '{"bars":1}\n');
  await fs.writeFile(path.join(dir, 'validation.json'), '{"ok":true}\n');
}
if (cmd === '--help') { console.log('usage: deepchord (fake)'); process.exit(0); }
if (cmd === 'demo') { await makeRun(rest[rest.indexOf('--out') + 1]); console.log(rest[rest.indexOf('--out') + 1]); process.exit(0); }
if (cmd === 'compose') { const dir = path.join(process.env.FAKE_DEEPCHORD_RUNS, 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)); await makeRun(dir); console.log('composing…'); console.log(dir); process.exit(0); }
if (cmd === 'feedback') { await fs.appendFile(path.join(rest[0], 'feedback.jsonl'), JSON.stringify({rating: rest[2], note: rest[4]}) + '\n'); process.exit(0); }
if (cmd === 'logic') { await fs.writeFile(path.join(rest[1], 'logic-handoff.json'), '{"open_request_accepted":true,"verified_import":false}\n'); process.exit(0); }
if (cmd === 'validate') process.exit(0);
console.error('fake deepchord: unknown command'); process.exit(3);
