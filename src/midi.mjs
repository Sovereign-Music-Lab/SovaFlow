// Minimal Standard MIDI File writer/reader for synthetic fixtures. No dependencies.
const vlq = n => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = n => [(n >>> 8) & 255, n & 255];

/** notes: [{pitch, startTick, durationTicks, velocity}] → format-0 SMF bytes (120 BPM, 4/4, PPQ 480). */
export function writeSmf(notes, {ppq = 480, bpm = 120} = {}) {
  const events = [];
  for (const n of notes) {
    events.push({tick: n.startTick, order: 1, bytes: [0x90, n.pitch, n.velocity ?? 90]});
    events.push({tick: n.startTick + n.durationTicks, order: 0, bytes: [0x80, n.pitch, 0]});
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const tempo = Math.round(60_000_000 / bpm);
  const track = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8];
  let last = 0;
  for (const e of events) { track.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  track.push(0, 0xff, 0x2f, 0);
  return Buffer.from([...'MThd'].map(c => c.charCodeAt(0)).concat(u32(6), u16(0), u16(1), u16(ppq), [...'MTrk'].map(c => c.charCodeAt(0)), u32(track.length), track));
}

/** Count note-on events (velocity > 0) in an SMF. Enough to verify synthetic artifacts. */
export function countNotes(bytes) {
  const b = Buffer.from(bytes);
  if (b.toString('latin1', 0, 4) !== 'MThd') throw new Error('Not a Standard MIDI File');
  let i = 8 + b.readUInt32BE(4), notes = 0;
  while (i + 8 <= b.length) {
    const len = b.readUInt32BE(i + 4), end = i + 8 + len; let p = i + 8, status = 0;
    if (b.toString('latin1', i, i + 4) === 'MTrk') while (p < end) {
      while (b[p++] & 0x80); // delta
      let s = b[p]; if (s & 0x80) { status = s; p++; } else s = status;
      if (s === 0xff) { p++; let l = 0, c; do { c = b[p++]; l = (l << 7) | (c & 0x7f); } while (c & 0x80); p += l; }
      else if (s === 0xf0 || s === 0xf7) { let l = 0, c; do { c = b[p++]; l = (l << 7) | (c & 0x7f); } while (c & 0x80); p += l; }
      else { const hi = s & 0xf0, two = hi !== 0xc0 && hi !== 0xd0; if (hi === 0x90 && b[p + 1] > 0) notes++; p += two ? 2 : 1; }
    }
    i = end;
  }
  return notes;
}

/** Deterministic sketch: a broken-chord pattern per bar (I–vi–IV–V in C), clearly labelled synthetic. */
export function syntheticSketch(bars = 4, ppq = 480) {
  const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], notes = [];
  for (let bar = 0; bar < bars; bar++) {
    const c = chords[bar % 4];
    for (let beat = 0; beat < 4; beat++) notes.push({pitch: c[beat % 3] + (beat === 3 ? 12 : 0), startTick: (bar * 4 + beat) * ppq, durationTicks: Math.round(ppq * 0.9), velocity: beat === 0 ? 96 : 78});
  }
  return notes;
}
