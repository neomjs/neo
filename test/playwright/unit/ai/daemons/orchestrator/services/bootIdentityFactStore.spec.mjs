import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    getBootIdentityFactFilePath,
    writeBootIdentityFact,
    readBootIdentityFact
} from '../../../../../../../ai/daemons/orchestrator/services/bootIdentityFactStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'boot-identity-fact-'));
}

// The full produceBootIdentityFact() shape the orchestrator persists.
const fact = (sourceRef, classification) => ({
    fact    : {bootAt: 1000, sourceRef, schedulerResumeState: 'none', lastCycleRef: 'rem-1', lastCycleAt: 2000},
    classification,
    advisory: true,
    reason  : 'fresh'
});

test.describe('bootIdentityFactStore — the cross-process advisory boot-identity fact carrier (#15079)', () => {
    test('write → read round-trips the latest fact', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('abc123', 'current'), {dir});

        const read = await readBootIdentityFact({dir});
        expect(read).toMatchObject({classification: 'current', advisory: true, fact: {sourceRef: 'abc123', bootAt: 1000}});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write is latest-wins (overwrite, not append)', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('old', 'stale-suspected'), {dir});
        await writeBootIdentityFact(fact('new', 'current'), {dir});

        const read = await readBootIdentityFact({dir});
        expect(read.classification).toBe('current');
        expect(read.fact.sourceRef).toBe('new');
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('read of a MISSING file resolves to null — advisory-unknown, never a throw (control-plane never gated)', async () => {
        const dir = await tmpDir();
        expect(await readBootIdentityFact({dir})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('read of a CORRUPT file resolves to null — advisory-unknown, never a throw', async () => {
        const dir = await tmpDir();
        await fs.writeFile(getBootIdentityFactFilePath(dir), '{ not valid json', 'utf8');

        expect(await readBootIdentityFact({dir})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('read with no dir resolves to null without throwing (defensive control-plane read)', async () => {
        expect(await readBootIdentityFact({})).toBeNull();
        expect(await readBootIdentityFact()).toBeNull();
    });

    test('write fails LOUD on a bad fact / missing dir (the orchestrator caller swallows it fail-soft, but a bug surfaces)', async () => {
        const dir = await tmpDir();
        await expect(writeBootIdentityFact(null, {dir})).rejects.toThrow('fact object is required');
        await expect(writeBootIdentityFact({fact: null}, {})).rejects.toThrow('dir is required');
        await fs.rm(dir, {recursive: true, force: true});
    });
});
