import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    BOOT_IDENTITY_FACT_VERSION,
    getBootIdentityFactFilePath,
    isValidBootIdentityEnvelope,
    MAX_FACT_BYTES,
    readBootIdentityFact,
    writeBootIdentityFact
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

    // --- cross-process snapshot contract: versioned envelope, atomic replace, stale-aware ---

    test('STALE prior-process snapshot → an explicit unknown advisory, never served as live', async () => {
        const dir = await tmpDir();
        // stamp generatedAt at t=1_000_000 (injected clock)…
        await writeBootIdentityFact(fact('abc', 'current'), {dir, nowFn: () => 1_000_000});
        // …then read 7h later — past the default 6h staleness horizon (the producing process is gone).
        const read = await readBootIdentityFact({dir, nowFn: () => 1_000_000 + 7 * 60 * 60 * 1000});
        expect(read).toEqual({fact: null, classification: 'unknown', advisory: true, reason: 'stale-boot-identity-fact'});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a FRESH snapshot within the horizon is served as-is (staleness is a boundary, not a blanket)', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('abc', 'current'), {dir, nowFn: () => 1_000_000});
        const read = await readBootIdentityFact({dir, nowFn: () => 1_000_000 + 60_000}); // 1 min later
        expect(read.classification).toBe('current');
        expect(read.fact.sourceRef).toBe('abc');
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a WRONG-VERSION / raw pre-envelope file → null (schema validation, never garbage-as-fact)', async () => {
        const dir = await tmpDir();
        // a raw pre-envelope fact (no {v, generatedAt}) must not be mis-served as a live fact
        await fs.writeFile(getBootIdentityFactFilePath(dir), JSON.stringify(fact('x', 'current')), 'utf8');
        expect(await readBootIdentityFact({dir})).toBeNull();
        // an explicitly wrong version
        await fs.writeFile(getBootIdentityFactFilePath(dir),
            JSON.stringify({v: 999, generatedAt: 1_000_000, fact: {classification: 'current', advisory: true}}), 'utf8');
        expect(await readBootIdentityFact({dir, nowFn: () => 1_000_000})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write fails LOUD (RangeError) on an oversized envelope — the byte bound', async () => {
        const dir  = await tmpDir();
        const huge = {fact: {bootAt: 1, sourceRef: 'x'.repeat(MAX_FACT_BYTES + 100)}, classification: 'current', advisory: true, reason: 'r'};
        await expect(writeBootIdentityFact(huge, {dir})).rejects.toThrow(/exceeds \d+ bytes/);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write is ATOMIC — a successful write leaves the target and no .tmp residue', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('abc', 'current'), {dir});
        const entries = await fs.readdir(dir);
        expect(entries).toContain('boot-identity-fact.json');
        expect(entries.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('isValidBootIdentityEnvelope discriminates the on-disk contract', () => {
        const good = {v: BOOT_IDENTITY_FACT_VERSION, generatedAt: 1, fact: {classification: 'current', advisory: true}};
        expect(isValidBootIdentityEnvelope(good)).toBe(true);
        expect(isValidBootIdentityEnvelope(null)).toBe(false);
        expect(isValidBootIdentityEnvelope({...good, v: BOOT_IDENTITY_FACT_VERSION + 1})).toBe(false); // wrong version
        expect(isValidBootIdentityEnvelope({...good, generatedAt: NaN})).toBe(false);                  // no finite generation ts
        expect(isValidBootIdentityEnvelope({...good, fact: null})).toBe(false);                        // no fact
        expect(isValidBootIdentityEnvelope({...good, fact: {advisory: true}})).toBe(false);            // fact missing classification
    });
});
