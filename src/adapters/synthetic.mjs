// Built-in synthetic adapter: lets the whole loop run with no other application installed.
// Its outputs are always marked synthetic; it never claims musical quality or audible output.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {writeSmf, syntheticSketch, countNotes} from '../midi.mjs';

export const synthetic = {
  name: 'synthetic',
  async probe() { return {available: true, detail: 'built in (no external application)'}; },
  async run(step, ctx) {
    if (step.action === 'note') {
      const text = String(step.args?.text ?? ctx.job.intention.text);
      return {state: ctx.dryRun ? 'proposed-only' : 'verified', proposed: {note: text}, ...(ctx.dryRun ? {} : {accepted: {note: text}, verified: {note: text}})};
    }
    // compose
    const bars = step.args?.bars ?? ctx.job.intention.bars ?? 4;
    const proposed = {bars, pattern: 'I–vi–IV–V broken chords in C (synthetic placeholder)', iteration: ctx.iteration};
    if (ctx.dryRun) return {state: 'proposed-only', proposed};
    const bytes = writeSmf(syntheticSketch(bars));
    const file = path.join(ctx.workDir, 'synthetic-sketch.mid');
    await fs.mkdir(ctx.workDir, {recursive: true});
    await fs.writeFile(file, bytes);
    const notes = countNotes(await fs.readFile(file));
    return {state: 'verified', proposed, accepted: {wrote: 'synthetic-sketch.mid'}, verified: {noteCount: notes, expected: bars * 4}, artifacts: [{kind: 'midi', path: file, editable: true, synthetic: true}]};
  },
};
