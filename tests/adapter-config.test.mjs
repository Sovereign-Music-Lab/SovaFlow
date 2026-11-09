import { deepchord } from '../src/adapters/deepchord.mjs';
import { sovaroll } from '../src/adapters/sovaroll.mjs';
import { startFakeSovaroll } from './fixtures/fake-sovaroll.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const FAKE_DC = path.resolve(import.meta.dirname, 'fixtures/fake-deepchord.mjs');

test('validate adapter probes with fake environment', async () => {
    const fake = await startFakeSovaroll();
    const originalDc = process.env.SOVAFLOW_DEEPCHORD;
    const originalUrl = process.env.SOVAFLOW_SOVAROLL_URL;

    try {
        process.env.SOVAFLOW_DEEPCHORD = FAKE_DC;
        process.env.SOVAFLOW_SOVAROLL_URL = fake.url;

        const files = [
            'deepchord-to-sovaroll.job.json',
            'deepchord-compose-loop.job.json',
            'sovaroll-rename-and-undo.job.json'
        ];

        const jobs = [];
        for (const file of files) {
            const content = await fs.readFile(path.resolve(import.meta.dirname, '../examples', file), 'utf-8');
            jobs.push(JSON.parse(content));
        }

        // First two are deepchord specific
        const dc1 = await deepchord.probe(jobs[0]);
        assert.strictEqual(dc1.available, true, 'Deepchord job 1 should be available');
        const dc2 = await deepchord.probe(jobs[1]);
        assert.strictEqual(dc2.available, true, 'Deepchord job 2 should be available');

        // All three are sovaroll specific
        for (const job of jobs) {
            const res = await sovaroll.probe(job);
            assert.strictEqual(res.available, true, 'Sovaroll job should be available');
            assert.ok(res.detail.includes(fake.url), `Detail should contain ${fake.url}`);
        }

        // Explicit override test
        const explicitJob = {
            ...jobs[0],
            adapters: {
                deepchord: { command: '/nonexistent/explicit' },
                sovaroll: { url: 'http://127.0.0.1:1' }
            }
        };

        const dcExplicit = await deepchord.probe(explicitJob);
        assert.strictEqual(dcExplicit.available, false, 'Explicit deepchord should be unavailable');
        const soExplicit = await sovaroll.probe(explicitJob);
        assert.strictEqual(soExplicit.available, false, 'Explicit sovaroll should be unavailable');

    } finally {
        if (originalDc === undefined) {
            delete process.env.SOVAFLOW_DEEPCHORD;
        } else {
            process.env.SOVAFLOW_DEEPCHORD = originalDc;
        }

        if (originalUrl === undefined) {
            delete process.env.SOVAFLOW_SOVAROLL_URL;
        } else {
            process.env.SOVAFLOW_SOVAROLL_URL = originalUrl;
        }
        await fake.close();
    }
});