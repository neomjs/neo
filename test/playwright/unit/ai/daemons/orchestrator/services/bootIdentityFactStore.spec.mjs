import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import fs                     from 'fs/promises';
import os                     from 'os';
import path                   from 'path';
import {BOOT_FRESHNESS_CLASS} from '../../../../../../../ai/daemons/orchestrator/services/bootIdentityFreshness.mjs';
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

// The full produceBootIdentityFact() shape the orchestrator persists — classification is a member of the
// producer's canonical BOOT_FRESHNESS_CLASS codebook (the read path validates against it).
const fact = (sourceRef, classification = BOOT_FRESHNESS_CLASS.designedDeferral) => ({
    fact    : {bootAt: 1000, sourceRef, schedulerResumeState: 'none', lastCycleRef: 'rem-1', lastCycleAt: 2000},
    classification,
    advisory: true,
    reason  : 'within-cadence-margin'
});

test.describe('bootIdentityFactStore — the cross-process advisory boot-identity fact carrier (#15079)', () => {
    test('write → read round-trips the latest fact', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('abc123'), {dir});

        const read = await readBootIdentityFact({dir});
        expect(read).toMatchObject({classification: 'designed-deferral', advisory: true, fact: {sourceRef: 'abc123', bootAt: 1000}});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write is latest-wins (overwrite, not append)', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('old', BOOT_FRESHNESS_CLASS.restartExplains), {dir});
        await writeBootIdentityFact(fact('new', BOOT_FRESHNESS_CLASS.designedDeferral), {dir});

        const read = await readBootIdentityFact({dir});
        expect(read.classification).toBe('designed-deferral');
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

    // --- cross-process snapshot contract: versioned envelope, atomic replace, codebook + stale-aware ---

    test('CONCURRENT writers do not corrupt the snapshot — unique per-write temps, a valid final read', async () => {
        const dir = await tmpDir();
        // Overlapping writes (a poll racing a restart) must never share a temp path; the final read is a
        // single valid snapshot, never a torn / ENOENT-orphaned file. A fixed .tmp name fails this.
        await Promise.all(Array.from({length: 40}, (_, i) => writeBootIdentityFact(fact(`w${i}`), {dir})));

        const read    = await readBootIdentityFact({dir});
        const entries = await fs.readdir(dir);
        expect(read).not.toBeNull();                                  // a readable, valid final snapshot survived the race
        expect(read.classification).toBe('designed-deferral');
        expect(entries.filter(f => f.endsWith('.tmp'))).toHaveLength(0); // no orphaned temps
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('STALE prior-process snapshot → an explicit unknown advisory, never served as live', async () => {
        const dir = await tmpDir();
        // stamp generatedAt at t=1_000_000 (injected clock)…
        await writeBootIdentityFact(fact('abc'), {dir, nowFn: () => 1_000_000});
        // …then read 7h later — past the default 6h staleness horizon (the producing process is gone).
        const read = await readBootIdentityFact({dir, nowFn: () => 1_000_000 + 7 * 60 * 60 * 1000});
        expect(read).toEqual({fact: null, classification: 'unknown', advisory: true, reason: 'stale-boot-identity-fact'});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a FRESH snapshot within the horizon is served as-is (staleness is a boundary, not a blanket)', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('abc'), {dir, nowFn: () => 1_000_000});
        const read = await readBootIdentityFact({dir, nowFn: () => 1_000_000 + 60_000}); // 1 min later
        expect(read.classification).toBe('designed-deferral');
        expect(read.fact.sourceRef).toBe('abc');
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a NON-CODEBOOK classification → null (codebook validation, never a fabricated class served as real)', async () => {
        const dir = await tmpDir();
        // A structurally-fine envelope whose classification is NOT a BOOT_FRESHNESS_CLASS member must be rejected.
        await fs.writeFile(getBootIdentityFactFilePath(dir),
            JSON.stringify({v: BOOT_IDENTITY_FACT_VERSION, generatedAt: 1_000_000, fact: {classification: 'current', advisory: true, reason: 'x'}}), 'utf8');
        expect(await readBootIdentityFact({dir, nowFn: () => 1_000_000})).toBeNull();

        // advisory:false is likewise out of contract (the surface is advisory-only, never a certainty verdict).
        await fs.writeFile(getBootIdentityFactFilePath(dir),
            JSON.stringify({v: BOOT_IDENTITY_FACT_VERSION, generatedAt: 1_000_000, fact: {classification: 'unknown', advisory: false, reason: 'x'}}), 'utf8');
        expect(await readBootIdentityFact({dir, nowFn: () => 1_000_000})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a WRONG-VERSION / raw pre-envelope file → null (schema validation, never garbage-as-fact)', async () => {
        const dir = await tmpDir();
        // a raw pre-envelope fact (no {v, generatedAt}) must not be mis-served as a live fact
        await fs.writeFile(getBootIdentityFactFilePath(dir), JSON.stringify(fact('x')), 'utf8');
        expect(await readBootIdentityFact({dir})).toBeNull();
        // an explicitly wrong version
        await fs.writeFile(getBootIdentityFactFilePath(dir),
            JSON.stringify({v: 999, generatedAt: 1_000_000, fact: {classification: 'unknown', advisory: true, reason: 'x'}}), 'utf8');
        expect(await readBootIdentityFact({dir, nowFn: () => 1_000_000})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write fails LOUD (RangeError) on an oversized envelope — the byte bound', async () => {
        const dir  = await tmpDir();
        const huge = {fact: {bootAt: 1, sourceRef: 'x'.repeat(MAX_FACT_BYTES + 100)}, classification: 'designed-deferral', advisory: true, reason: 'r'};
        await expect(writeBootIdentityFact(huge, {dir})).rejects.toThrow(/exceeds \d+ bytes/);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('write is ATOMIC — a successful write leaves the target and no .tmp residue', async () => {
        const dir = await tmpDir();
        await writeBootIdentityFact(fact('abc'), {dir});
        const entries = await fs.readdir(dir);
        expect(entries).toContain('boot-identity-fact.json');
        expect(entries.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('isValidBootIdentityEnvelope discriminates the on-disk contract (version + codebook + advisory + reason)', () => {
        const good = {v: BOOT_IDENTITY_FACT_VERSION, generatedAt: 1, fact: {classification: BOOT_FRESHNESS_CLASS.designedDeferral, advisory: true, reason: 'r'}};
        expect(isValidBootIdentityEnvelope(good)).toBe(true);
        expect(isValidBootIdentityEnvelope(null)).toBe(false);
        expect(isValidBootIdentityEnvelope({...good, v: BOOT_IDENTITY_FACT_VERSION + 1})).toBe(false);                     // wrong version
        expect(isValidBootIdentityEnvelope({...good, generatedAt: NaN})).toBe(false);                                     // no finite generation ts
        expect(isValidBootIdentityEnvelope({...good, fact: null})).toBe(false);                                           // no fact
        expect(isValidBootIdentityEnvelope({...good, fact: {advisory: true, reason: 'r'}})).toBe(false);                  // missing classification
        expect(isValidBootIdentityEnvelope({...good, fact: {classification: 'current', advisory: true, reason: 'r'}})).toBe(false); // non-codebook class
        expect(isValidBootIdentityEnvelope({...good, fact: {classification: BOOT_FRESHNESS_CLASS.unknown, advisory: false, reason: 'r'}})).toBe(false); // advisory:false
        expect(isValidBootIdentityEnvelope({...good, fact: {classification: BOOT_FRESHNESS_CLASS.unknown, advisory: true, reason: ''}})).toBe(false);   // empty reason
    });
});
