import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {
    appendAutoAcceptedLoss,
    getAcceptedLossAuditFilePath,
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
});
