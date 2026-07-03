import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    getResumeStateFilePath,
    readResumeState,
    writeResumeState,
    clearResumeState
} from '../../../../../../../ai/services/knowledge-base/helpers/kbEmbeddingResumeStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'kb-resume-'));
}

test.describe('kbEmbeddingResumeStore — durable resume-state', () => {
    test('write → read round-trips fingerprint + shadowName + attempts', async () => {
        const dir = await tmpDir();
        await writeResumeState({dir, fingerprint: 'fp-1', shadowName: 'kb-resume-shadow', attempts: 2});

        expect(await readResumeState({dir})).toEqual({fingerprint: 'fp-1', shadowName: 'kb-resume-shadow', attempts: 2});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a missing marker reads as null (→ clean rebuild)', async () => {
        const dir = await tmpDir();
        expect(await readResumeState({dir})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a corrupt marker reads as null, never throws (fail-safe → clean rebuild)', async () => {
        const dir = await tmpDir();
        await fs.writeFile(getResumeStateFilePath(dir), '{ not json', 'utf8');
        expect(await readResumeState({dir})).toBeNull();

        await fs.writeFile(getResumeStateFilePath(dir), JSON.stringify({fingerprint: 'fp'}), 'utf8'); // missing shadowName
        expect(await readResumeState({dir})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('attempts defaults to 1 when absent/invalid', async () => {
        const dir = await tmpDir();
        await fs.writeFile(getResumeStateFilePath(dir), JSON.stringify({fingerprint: 'fp', shadowName: 's'}), 'utf8');
        expect((await readResumeState({dir})).attempts).toBe(1);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('clear removes the marker → next read is null', async () => {
        const dir = await tmpDir();
        await writeResumeState({dir, fingerprint: 'fp', shadowName: 's'});
        expect(await readResumeState({dir})).not.toBeNull();

        expect(await clearResumeState({dir})).toBe(true);
        expect(await readResumeState({dir})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write creates the directory if absent + guards required args', async () => {
        const dir = path.join(await tmpDir(), 'nested', 'kb-sync');
        await writeResumeState({dir, fingerprint: 'fp', shadowName: 's'});
        expect(await readResumeState({dir})).toMatchObject({fingerprint: 'fp', shadowName: 's'});

        await expect(writeResumeState({dir, shadowName: 's'})).rejects.toThrow(/fingerprint is required/);
        await expect(writeResumeState({dir, fingerprint: 'fp'})).rejects.toThrow(/shadowName is required/);
    });
});
