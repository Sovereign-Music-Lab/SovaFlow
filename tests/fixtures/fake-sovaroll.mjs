// Test double for the SovaRoll HTTP API subset SovaFlow uses. Labelled fake: used only by tests.
import http from 'node:http';
import {writeSmf} from '../../src/midi.mjs';

export async function startFakeSovaroll({rejectImport = false, externalEditAfterApply = false} = {}) {
  const doc = 'doc-fake-1';
  const project = {name: 'Fake', revision: 0, tracks: [], clips: []};
  const history = [];
  const calls = [];
  const snapshot = () => ({project, session: {document: {id: doc}}, capabilities: {version: 'fake'}});
  const send = (res, code, body) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x'); calls.push({method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), doc: req.headers['x-newdaw-document']});
    if (url.pathname === '/api/state') return send(res, 200, snapshot());
    if (req.headers['x-newdaw-document'] !== doc) return send(res, 428, {applied: false, errors: [{code: 'EXPECTED_DOCUMENT_REQUIRED', message: 'doc'}]});
    if (url.pathname === '/api/export/midi') { res.writeHead(200, {'Content-Type': 'audio/midi'}); return res.end(writeSmf([{pitch: 60, startTick: 0, durationTicks: 480}])); }
    if (url.pathname === '/api/import/midi') {
      if (Number(url.searchParams.get('expectedRevision')) !== project.revision) return send(res, 409, {applied: false, errors: [{code: 'REVISION_CONFLICT', message: 'stale'}]});
      if (rejectImport || raw.toString('latin1', 0, 4) !== 'MThd') return send(res, 422, {applied: false, errors: [{code: 'UNSUPPORTED_MIDI', message: 'bad'}]});
      history.push(structuredClone(project)); project.revision++; project.tracks.push({id: 't' + project.revision}); project.clips.push({id: 'c' + project.revision, notes: [{}, {}]});
      return send(res, 200, {status: 'applied', applied: true, projectRevision: project.revision});
    }
    if (url.pathname === '/api/command') {
      const body = JSON.parse(raw.toString());
      if (body.expectedRevision !== project.revision) return send(res, 409, {status: 'error', applied: false, errors: [{code: 'REVISION_CONFLICT', message: 'stale'}]});
      if (body.command === 'history.undo') { const prev = history.pop(); Object.assign(project, prev, {revision: project.revision + 1}); return send(res, 200, {status: 'applied', applied: true, projectRevision: project.revision}); }
      if (body.command !== 'project.rename') return send(res, 422, {status: 'error', applied: false, errors: [{code: 'UNKNOWN_COMMAND', message: body.command}]});
      if (body.dryRun) return send(res, 200, {status: 'validated', applied: false, projectRevision: project.revision, changes: {updated: ['p']}});
      history.push(structuredClone(project)); project.name = body.arguments.name; project.revision++;
      if (externalEditAfterApply) setTimeout(() => { project.revision++; }, 0); // someone else edits right after
      return send(res, 200, {status: 'applied', applied: true, projectRevision: project.revision});
    }
    send(res, 404, {errors: [{code: 'NOT_FOUND', message: url.pathname}]});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {url: `http://127.0.0.1:${server.address().port}`, project, calls, close: () => new Promise(r => server.close(r)), bump() { project.revision++; }};
}
