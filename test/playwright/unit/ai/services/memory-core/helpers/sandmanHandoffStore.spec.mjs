import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {readSandmanHandoff} from '../../../../../../../ai/services/memory-core/helpers/sandmanHandoffStore.mjs';

test.describe('sandmanHandoffStore (#15599)', () => {
    test('reads a present fresh handoff with content + freshness metadata', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'sandman-handoff-')),
              filePath = path.join(dir, 'sandman_handoff.md'),
              now      = Date.now();

        await fs.writeFile(filePath, '# Sandman Handoff\n\ntyped gaps + golden path\n', 'utf8');
        await fs.utimes(filePath, new Date(now - 60_000), new Date(now - 60_000));

        const read = await readSandmanHandoff({filePath, now});

        expect(read.reason).toBeNull();
        expect(read.content).toContain('typed gaps + golden path');
        expect(read.path).toBe(filePath);
        expect(read.mtimeMs).toBeGreaterThan(0);
        expect(read.ageMs).toBeGreaterThanOrEqual(59_000);
        expect(read.staleAfterMs).toBe(36 * 60 * 60 * 1000);
        expect(read.stale).toBe(false);
    });

    test('missing handoff returns an explicit null-reason payload, never a throw', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'sandman-handoff-')),
              filePath = path.join(dir, 'does-not-exist.md');

        const read = await readSandmanHandoff({filePath});

        expect(read).toMatchObject({
            content: null,
            path   : filePath,
            mtimeMs: null,
            stale  : true,
            reason : 'handoff-not-found'
        });
    });

    test('unconfigured path fails with an explicit reason code', async () => {
        await expect(readSandmanHandoff({filePath: undefined})).resolves.toMatchObject({
            content: null,
            reason : 'handoff-path-unconfigured'
        });
    });

    test('stale flag fires past the freshness window; per-call override and <=0 disable it', async () => {
        const dir        = await fs.mkdtemp(path.join(os.tmpdir(), 'sandman-handoff-')),
              filePath   = path.join(dir, 'sandman_handoff.md'),
              now        = Date.now(),
              twoDaysAgo = now - 48 * 60 * 60 * 1000;

        await fs.writeFile(filePath, 'old handoff\n', 'utf8');
        await fs.utimes(filePath, new Date(twoDaysAgo), new Date(twoDaysAgo));

        await expect(readSandmanHandoff({filePath, now})).resolves.toMatchObject({
            stale : true,
            reason: null
        });

        // Per-call override: a generous window reclassifies the same file as fresh.
        await expect(readSandmanHandoff({filePath, now, staleAfterMs: 72 * 60 * 60 * 1000})).resolves.toMatchObject({
            stale: false
        });

        // <=0 disables stale classification by construction.
        await expect(readSandmanHandoff({filePath, now, staleAfterMs: 0})).resolves.toMatchObject({
            stale: false
        });
    });

    test('honors a custom resolved path (the NEO_HANDOFF_FILE_PATH leaf override flow)', async () => {
        const dir        = await fs.mkdtemp(path.join(os.tmpdir(), 'sandman-handoff-')),
              customPath = path.join(dir, 'custom', 'override-handoff.md');

        await fs.ensureDir(path.dirname(customPath));
        await fs.writeFile(customPath, 'override location\n', 'utf8');

        const read = await readSandmanHandoff({filePath: customPath});

        expect(read.reason).toBeNull();
        expect(read.path).toBe(customPath);
        expect(read.content).toContain('override location');
    });

    test('oversized handoff returns an explicit too-large reason with size details', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'sandman-handoff-')),
              filePath = path.join(dir, 'sandman_handoff.md');

        await fs.writeFile(filePath, 'x'.repeat(1024), 'utf8');

        await expect(readSandmanHandoff({filePath, maxBytes: 128})).resolves.toMatchObject({
            content: null,
            reason : 'handoff-too-large',
            details: {size: 1024, maxBytes: 128}
        });
    });
});
