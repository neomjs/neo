import {setup} from '../../../../setup.mjs';

const appName = 'HookProjectionWriterTest';

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
 * The production owner — the module whose absence meant a pile of correct primitives published nothing.
 *
 * These run the REAL lease, submission gate and transport against a real store, with only the clock and
 * the filesystem substituted. That is the point: everything the reviewer found missing (schema, target
 * derivation, token source, broker clock, filesystem owner, invocation) is bound here, so this suite is
 * the first place the whole thing is exercised as one call.
 */
test.describe('hookProjectionWriter — the one place the primitives meet the world', () => {
    let makeHookProjectionWriter, deriveTargetId, TARGET_TUPLE_FIELDS;
    let db, now;

    const config = {hookProjectionRoot: '/runtime/mc/hook-projections', hookProjectionLeaseTtlMs: 15_000};

    const tuple = {
        schemaVersion     : 'live-lane-awareness-projection.v1',
        capability        : 'self-awareness',
        agentId           : '@neo-opus-ada',
        harnessType       : 'claude-code',
        instanceKeyDigest : 'inst-abc',
        workspaceKeyDigest: 'ws-def',
        projectionKind    : 'hook'
    };

    const binding = {agentId: '@neo-opus-ada', harnessType: 'claude-code'};

    const makeFs = () => {
        const written = new Map();

        return {
            written,
            mkdirSync    : () => {},
            writeFileSync: (path, body) => written.set(path, body),
            renameSync   : (from, to) => { written.set(to, written.get(from)); written.delete(from) },
            openSync     : () => 1,
            fsyncSync    : () => {},
            closeSync    : () => {},
            unlinkSync   : path => written.delete(path),
            readdirSync  : () => []
        }
    };

    const writer = (overrides = {}) => makeHookProjectionWriter({
        getDb: () => db,
        config,
        fs   : makeFs(),
        clock: () => now,
        ...overrides
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/hookProjectionWriter.mjs');
        makeHookProjectionWriter = mod.makeHookProjectionWriter;
        deriveTargetId           = mod.deriveTargetId;
        TARGET_TUPLE_FIELDS      = mod.TARGET_TUPLE_FIELDS;
    });

    test.beforeEach(() => {
        db  = new Database(':memory:');
        now = 1_800_000_000_000;
    });

    test.afterEach(() => db?.close());

    test('the whole publication is ONE call — schema, derivation, token, clock and fs all bound', () => {
        const fs = makeFs(),
              wr = writer({fs});

        wr.ensureSchema();
        wr.submitChannel({
            tuple,
            channel          : 'lifecycle-frontier',
            envelope         : {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true},
            sourceWatermark  : 'w-1',
            capturedAt       : '2026-07-16T12:00:00.000Z',
            expiresAt        : '2026-07-16T12:05:00.000Z',
            isTargetAdmitted : () => true,
            mayProduceChannel: () => true
        });

        const result = wr.publish({tuple, consumerBinding: binding});

        expect(result.published).toBe(true);

        // the caller never chose a path — it named an attested target and the server derived the rest
        const file    = `${config.hookProjectionRoot}/${result.targetId}/current.json`,
              payload = JSON.parse(fs.written.get(file));

        expect(payload.schemaVersion).toBe('live-lane-awareness-projection.v1');
        expect(payload.publication.targetId).toBe(result.targetId);
        expect(payload.consumerBinding).toEqual(binding);
        expect(payload.lifecycleActions.envelope).toEqual({schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true});
        // a slot nobody published is honestly missing, not absent
        expect(payload.computedRoute.status).toBe('missing');
    });

    test('the target id is derived, stable across sessions, and distinct per agent', () => {
        // Stable: the same agent after a restart must reach the SAME target, or every restart would
        // orphan its own projection. That is why session id is not in the tuple.
        expect(deriveTargetId(tuple)).toBe(deriveTargetId({...tuple}));

        // Distinct: two agents sharing a projection is the failure never-foreign exists to prevent.
        expect(deriveTargetId(tuple)).not.toBe(deriveTargetId({...tuple, agentId: '@neo-gpt'}));
        expect(deriveTargetId(tuple)).not.toBe(deriveTargetId({...tuple, instanceKeyDigest: 'other'}));

        // Opaque and filesystem-safe by construction, so the transport's token rule needs no sanitizer.
        expect(deriveTargetId(tuple)).toMatch(/^[0-9a-f]{32}$/);
    });

    test('field separation prevents a collision that plain concatenation would allow', () => {
        // ('a','bc') and ('ab','c') must not collapse onto one target.
        const left  = deriveTargetId({...tuple, agentId: 'a',  harnessType: 'bc'}),
              right = deriveTargetId({...tuple, agentId: 'ab', harnessType: 'c'});

        expect(left).not.toBe(right);
    });

    test('a tuple with ANY hole is refused — a hole would collapse two targets into one', () => {
        for (const field of TARGET_TUPLE_FIELDS) {
            expect(() => deriveTargetId({...tuple, [field]: undefined})).toThrow(new RegExp(`missing: .*${field}`));
        }
    });

    test('contention is a normal outcome, not an error — another holder is publishing', () => {
        const wr = writer();

        wr.ensureSchema();

        // a live holder on the same target
        const first = wr.publish({tuple, consumerBinding: binding});
        expect(first.published).toBe(true);

        // ...which released itself, so the next publication succeeds rather than waiting out the TTL
        expect(wr.publish({tuple, consumerBinding: binding}).published).toBe(true);
    });

    test('a LOSING contender deletes nothing — the sweep is a right the token confers', async () => {
        // The reviewer's release blocker: sweeping BEFORE acquisition let a loser delete the live
        // holder's in-flight temp sibling between its write, flush and rename — one publisher
        // corrupting another's mutation window, which is exactly what the fence exists to stop.
        const deleted = [],
              fs      = makeFs();

        fs.readdirSync = () => ['current.json.orphan.tmp'];
        fs.unlinkSync  = path => deleted.push(path);

        const wr = writer({fs});

        wr.ensureSchema();

        // A live holder occupies the target: acquire without publishing, so the lease stays held.
        const {acquireProjectionLease} = await import('../../../../../../ai/services/memory-core/hookProjectionLease.mjs');

        acquireProjectionLease({
            db,
            targetId      : deriveTargetId(tuple),
            instanceDigest: 'the-holder',
            now,
            leaseTtlMs    : config.hookProjectionLeaseTtlMs,
            mintToken     : () => 'holder-token',
            hashToken     : raw => `h-${raw}`
        });

        // The contender loses — and must not have touched the holder's litter on its way out.
        const loser = wr.publish({tuple, consumerBinding: binding});

        expect(loser.published).toBe(false);
        expect(loser.reason).toBe('held');
        expect(deleted).toEqual([]);
    });

    test('an unavailable store fails CLOSED — a missing store is not an empty projection', () => {
        const wr = makeHookProjectionWriter({getDb: () => null, config, fs: makeFs(), clock: () => now});

        expect(() => wr.ensureSchema()).toThrow(/SQLite store is unavailable/);
        expect(() => wr.publish({tuple, consumerBinding: binding})).toThrow(/SQLite store is unavailable/);
    });

    test('fails LOUD on a missing config leaf — never a guessed root or an unbounded lease', () => {
        expect(() => makeHookProjectionWriter({getDb: () => db, config: {...config, hookProjectionRoot: undefined}, fs: makeFs()}))
            .toThrow(/hookProjectionRoot is required from config/);
        expect(() => makeHookProjectionWriter({getDb: () => db, config: {...config, hookProjectionLeaseTtlMs: undefined}, fs: makeFs()}))
            .toThrow(/hookProjectionLeaseTtlMs is required from config/);
        expect(() => makeHookProjectionWriter({getDb: undefined, config, fs: makeFs()}))
            .toThrow(/injected getDb resolver is required/);
    });
});
