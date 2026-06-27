import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {appendFile, mkdtemp, rm} from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {
    appendAutoAcceptedLoss,
    getAcceptedLossAuditFilePath,
    pruneAutoAcceptedLossAudit,
    readAutoAcceptedLossAudit
} from '../../../../../../../ai/services/memory-core/helpers/acceptedLossAuditStore.mjs';

test.describe('acceptedLossAuditStore — durable autonomous accepted-loss audit log', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-accepted-loss-audit-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    const entry = (overrides = {}) => ({
        schemaVersion: 1,
        type         : 'auto-accepted-loss',
        fingerprint  : 'fp-abc',
        acceptedIds  : ['a', 'b'],
        residueCount : 2,
        ...overrides
    });

    test('append → read round-trips entries in append order', async () => {
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-1'}), {dir: tmpDir});
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-2'}), {dir: tmpDir});

        const records = await readAutoAcceptedLossAudit({dir: tmpDir});

        expect(records).toHaveLength(2);
        expect(records.map(r => r.fingerprint)).toEqual(['fp-1', 'fp-2']);
        expect(records[0]).toMatchObject({type: 'auto-accepted-loss', acceptedIds: ['a', 'b']});
    });

    test('a missing log reads as [] (no settlements yet) — never throws on absence', async () => {
        expect(await readAutoAcceptedLossAudit({dir: tmpDir})).toEqual([]);
    });

    test('append creates the state dir if it does not exist', async () => {
        const nested = path.join(tmpDir, 'deep', 'state');
        await appendAutoAcceptedLoss(entry(), {dir: nested});

        expect(await readAutoAcceptedLossAudit({dir: nested})).toHaveLength(1);
        expect(getAcceptedLossAuditFilePath(nested)).toBe(path.join(nested, 'auto-accepted-loss.jsonl'));
    });

    test('append is purely append-only (telemetry, not a gate): existing entries are preserved', async () => {
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-old'}), {dir: tmpDir});
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-new'}), {dir: tmpDir});

        const records = await readAutoAcceptedLossAudit({dir: tmpDir});
        expect(records.map(r => r.fingerprint)).toEqual(['fp-old', 'fp-new']);
    });

    test('rejects a missing entry / missing dir', async () => {
        await expect(appendAutoAcceptedLoss(null, {dir: tmpDir})).rejects.toThrow('entry');
        await expect(appendAutoAcceptedLoss(entry(), {})).rejects.toThrow('dir');
    });

    test('a corrupt line is skipped on read (fail-safe — a torn append must not break the audit)', async () => {
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-good-1'}), {dir: tmpDir});
        await appendFile(getAcceptedLossAuditFilePath(tmpDir), '{ not json\n', 'utf8');
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-good-2'}), {dir: tmpDir});

        const records = await readAutoAcceptedLossAudit({dir: tmpDir});
        expect(records.map(r => r.fingerprint)).toEqual(['fp-good-1', 'fp-good-2']); // corrupt middle line dropped
    });

    test('prune is a no-op under the cap (returns pruned:0, log untouched)', async () => {
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-1'}), {dir: tmpDir});
        await appendAutoAcceptedLoss(entry({fingerprint: 'fp-2'}), {dir: tmpDir});

        expect(await pruneAutoAcceptedLossAudit({dir: tmpDir, maxEvents: 10})).toEqual({pruned: 0, retained: 2});
        expect(await readAutoAcceptedLossAudit({dir: tmpDir})).toHaveLength(2);
    });

    test('prune caps to the most-recent maxEvents (oldest dropped, append order preserved)', async () => {
        for (let i = 0; i < 5; i++) {
            await appendAutoAcceptedLoss(entry({fingerprint: `fp-${i}`}), {dir: tmpDir});
        }

        const result  = await pruneAutoAcceptedLossAudit({dir: tmpDir, maxEvents: 2});
        const records = await readAutoAcceptedLossAudit({dir: tmpDir});

        expect(result).toEqual({pruned: 3, retained: 2});
        expect(records.map(r => r.fingerprint)).toEqual(['fp-3', 'fp-4']); // newest kept
    });

    test('prune on a missing / empty log is a safe no-op', async () => {
        expect(await pruneAutoAcceptedLossAudit({dir: tmpDir, maxEvents: 5})).toEqual({pruned: 0, retained: 0});
    });

    test('prune rejects a missing dir; maxEvents<=0 is a no-op', async () => {
        await expect(pruneAutoAcceptedLossAudit({})).rejects.toThrow('dir');
        await appendAutoAcceptedLoss(entry(), {dir: tmpDir});
        expect(await pruneAutoAcceptedLossAudit({dir: tmpDir, maxEvents: 0})).toEqual({pruned: 0, retained: 1});
    });

    test('append self-bounds: crossing the byte trigger auto-prunes to maxEvents (the wiring, not just the prune)', async () => {
        // A tiny injected trigger fires the append-time stat-gate every append; each prune caps to maxEvents.
        for (let i = 0; i < 6; i++) {
            await appendAutoAcceptedLoss(entry({fingerprint: `fp-${i}`}), {dir: tmpDir, triggerBytes: 1, maxEvents: 2});
        }

        const records = await readAutoAcceptedLossAudit({dir: tmpDir});
        // The self-bounding gate kept the file at the cap (the prune actually fired on append, not just on demand).
        expect(records).toHaveLength(2);
        expect(records.map(r => r.fingerprint)).toEqual(['fp-4', 'fp-5']); // newest two
    });
});
