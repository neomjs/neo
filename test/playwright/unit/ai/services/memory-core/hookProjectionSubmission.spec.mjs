import {setup} from '../../../../setup.mjs';

const appName = 'HookProjectionSubmissionTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Database       from 'better-sqlite3';

/**
 * Producer submission against a real store. The three watermark cases are genuinely different facts,
 * and collapsing any two of them is the defect class: a rejected replay turns every retry into a false
 * conflict, and an accepted conflict publishes a coherent-looking lie.
 */
test.describe('hookProjectionSubmission — one producer, one channel, monotonic watermarks', () => {
    let createHookProjectionTables, addProjectionConflictColumn, submitProjectionChannel;
    let db;

    const targetId = 'target-abc',
          now      = '2026-07-16T12:00:00.000Z';

    const submit = (overrides = {}) => submitProjectionChannel({
        db,
        targetId,
        channel          : 'lifecycle-frontier',
        envelope         : {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true},
        sourceWatermark  : '2026-07-16T12:00:00.000Z',
        capturedAt       : now,
        expiresAt        : '2026-07-16T12:05:00.000Z',
        now,
        isTargetAdmitted : () => true,
        mayProduceChannel: () => true,
        ...overrides
    });

    const storedRow = () => db.prepare(`
        SELECT source_watermark, envelope_json, conflict_reason FROM HookProjectionChannels
        WHERE target_id = ? AND channel = ?
    `).get(targetId, 'lifecycle-frontier');

    test.beforeAll(async () => {
        const lease = await import('../../../../../../ai/services/memory-core/hookProjectionLease.mjs'),
              mod   = await import('../../../../../../ai/services/memory-core/hookProjectionSubmission.mjs');

        createHookProjectionTables  = lease.createHookProjectionTables;
        addProjectionConflictColumn = mod.addProjectionConflictColumn;
        submitProjectionChannel     = mod.submitProjectionChannel;
    });

    test.beforeEach(() => {
        db = new Database(':memory:');
        createHookProjectionTables(db);
        addProjectionConflictColumn(db);
    });

    test.afterEach(() => db?.close());

    test('a first submission advances the channel', () => {
        const result = submit();

        expect(result).toEqual({accepted: true, outcome: 'advanced'});
        expect(storedRow().source_watermark).toBe('2026-07-16T12:00:00.000Z');
        expect(storedRow().conflict_reason).toBeNull();
    });

    test('a strictly newer watermark supersedes the stored payload', () => {
        submit();

        const result = submit({
            sourceWatermark: '2026-07-16T12:01:00.000Z',
            envelope       : {schemaVersion: 'lifecycle-frontier.v1', items: [{id: 'a'}], notAuthority: true}
        });

        expect(result.outcome).toBe('advanced');
        expect(storedRow().source_watermark).toBe('2026-07-16T12:01:00.000Z');
        expect(JSON.parse(storedRow().envelope_json).items).toEqual([{id: 'a'}]);
    });

    test('an equal watermark with an IDENTICAL payload is idempotent — a retry is not an error', () => {
        submit();
        const replay = submit();

        // Sources retry after timeouts. Treating replay as a conflict would turn every transient
        // failure into a permanently degraded channel.
        expect(replay).toEqual({accepted: true, outcome: 'replayed'});
        expect(storedRow().conflict_reason).toBeNull();
    });

    test('an equal watermark with a DIFFERENT payload degrades the channel and keeps the prior', () => {
        submit();

        const conflict = submit({envelope: {schemaVersion: 'lifecycle-frontier.v1', items: [{id: 'contested'}], notAuthority: true}});

        expect(conflict.accepted).toBe(false);
        expect(conflict.outcome).toBe('source-conflict');
        // Two payloads claiming one point in time cannot both be true, and there is no basis to prefer
        // either — so the prior is kept rather than arbitrarily replaced...
        expect(JSON.parse(storedRow().envelope_json).items).toEqual([]);
        // ...and the conflict is RECORDED, because a degradation the reader cannot see is just a
        // silent wrong answer.
        expect(storedRow().conflict_reason).toContain('two payloads claim watermark');
    });

    test('a REGRESSED watermark is rejected — a slow read must not move the projection backwards', () => {
        submit({sourceWatermark: '2026-07-16T12:05:00.000Z'});

        const stale = submit({
            sourceWatermark: '2026-07-16T12:01:00.000Z',
            envelope       : {schemaVersion: 'lifecycle-frontier.v1', items: [{id: 'old'}], notAuthority: true}
        });

        expect(stale.accepted).toBe(false);
        expect(stale.outcome).toBe('regressed-watermark');
        expect(storedRow().source_watermark).toBe('2026-07-16T12:05:00.000Z');
        expect(JSON.parse(storedRow().envelope_json).items).toEqual([]);
    });

    test('a newer watermark CLEARS an earlier conflict — the source moved past the contested point', () => {
        submit();
        submit({envelope: {schemaVersion: 'lifecycle-frontier.v1', items: [{id: 'contested'}], notAuthority: true}});
        expect(storedRow().conflict_reason).toContain('two payloads');

        submit({sourceWatermark: '2026-07-16T12:09:00.000Z'});

        // The contested instant is no longer what this channel describes, so carrying its conflict
        // forward would degrade a channel that has since become coherent.
        expect(storedRow().conflict_reason).toBeNull();
        expect(storedRow().source_watermark).toBe('2026-07-16T12:09:00.000Z');
    });

    test('an unadmitted target and a foreign producer are refused — and never write', () => {
        const unadmitted = submit({isTargetAdmitted: () => false});
        expect(unadmitted.outcome).toBe('target-not-admitted');
        expect(storedRow()).toBeUndefined();

        const foreign = submit({mayProduceChannel: () => false});
        expect(foreign.outcome).toBe('foreign-producer');
        // a producer may not write a channel it does not own, and must not merge another's
        expect(storedRow()).toBeUndefined();
    });

    test('fails LOUD on a missing watermark or an unbound gate — a wiring bug is not a rejection', () => {
        expect(() => submit({sourceWatermark: undefined})).toThrow(/sourceWatermark is required/);
        expect(() => submit({isTargetAdmitted: undefined})).toThrow(/isTargetAdmitted and mayProduceChannel/);
        expect(() => submit({envelope: undefined})).toThrow(/envelope must be a plain object/);
    });

    test('a FOREIGN schema is refused — a typed envelope in the wrong channel is not a typed channel', () => {
        // Requiring only a nonempty schemaVersion admitted this: a well-formed lifecycle envelope landing
        // in the route slot. Both halves are individually valid, which is exactly why the store cannot be
        // the party that notices — the disagreement is between them.
        const mismatched = submit({
            channel : 'computed-route',
            envelope: {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true}
        });

        expect(mismatched.accepted).toBe(false);
        expect(mismatched.outcome).toBe('schema-mismatch');
        expect(mismatched.reason).toMatch(/requires computed-route\.v1/);

        expect(db.prepare(`
            SELECT 1 FROM HookProjectionChannels WHERE target_id = ? AND channel = ?
        `).get(targetId, 'computed-route')).toBeUndefined();
    });

    test('the CORRECT schema for that same channel still advances — the gate binds, it does not blanket-refuse', () => {
        // Without this, a check that rejected every computed-route submission would pass the test above
        // and prove nothing.
        const matched = submit({
            channel : 'computed-route',
            envelope: {schemaVersion: 'computed-route.v1', route: [], notAuthority: true}
        });

        expect(matched).toEqual({accepted: true, outcome: 'advanced'});
    });

    test('a channel with no pinned contract is refused rather than waved through', () => {
        // An unknown channel is the unbindable-payload case this registry exists to prevent, so it cannot
        // be the one case that passes.
        const unknown = submit({channel: 'context-view:recent-turns'});

        expect(unknown.accepted).toBe(false);
        expect(unknown.outcome).toBe('unknown-channel');

        expect(db.prepare(`SELECT COUNT(*) AS n FROM HookProjectionChannels`).get().n).toBe(0);
    });
});
