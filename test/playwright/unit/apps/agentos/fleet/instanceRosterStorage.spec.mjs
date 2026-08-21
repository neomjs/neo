import {expect, test} from '@playwright/test';

import {createFleetProfile, FLEET_PROFILE_CONTRACT_VERSION}                         from '../../../../../../apps/agentos/fleet/connectionProfiles.mjs';
import {INSTANCE_ROSTER_STORAGE_KEY, reviveInstanceRoster, serializeInstanceRoster} from '../../../../../../apps/agentos/fleet/instanceRosterStorage.mjs';

/**
 * The roster (de)serialization policy: every stored row re-passes the C1 closed-schema
 * guard, stale rows rehydrate, refused rows drop LOUDLY with their reason — and a broken envelope
 * yields the empty roster, never a crashed boot.
 */
test.describe('instanceRosterStorage — persistence over the C1 guard (#17328)', () => {
    const local = () => createFleetProfile({custodian: 'session-only', endpoint: 'http://127.0.0.1:8083/fleet'});
    const cloud = () => createFleetProfile({custodian: 'session-only', endpoint: 'https://fleet.example.io/fleet', label: 'cloud-eu'});

    test('round-trip: validated records serialize and revive verbatim, labels included', () => {
        const json               = serializeInstanceRoster([local(), cloud()]);
        const {records, dropped} = reviveInstanceRoster(json);

        expect(dropped).toHaveLength(0);
        expect(records).toHaveLength(2);
        expect(records[1]).toMatchObject({label: 'cloud-eu', custodian: 'session-only'});
        expect(records[1].profileId).toBe('fleet-profile:v1:https://fleet.example.io/fleet')
    });

    test('serialization IS a write gate: a credential-bearing row throws instead of persisting', () => {
        const smuggled = {...local(), token: 'd'.repeat(43)};

        expect(() => serializeInstanceRoster([smuggled])).toThrow(/credential/)
    });

    test('a stale contract version rehydrates: identity re-derives, custody truth survives', () => {
        const staleRow = {...cloud(), contractVersion: 999};

        const {records, dropped} = reviveInstanceRoster(JSON.stringify([staleRow]));

        expect(dropped).toHaveLength(0);
        expect(records).toHaveLength(1);
        expect(records[0].contractVersion).toBe(FLEET_PROFILE_CONTRACT_VERSION);
        expect(records[0].label).toBe('cloud-eu')
    });

    test('a refused row drops LOUDLY with its reason while its siblings survive — one bad row never bricks the roster', () => {
        const forged = {...local(), profileId: 'fleet-profile:v1:http://forged/elsewhere'};

        const {records, dropped} = reviveInstanceRoster(JSON.stringify([forged, {...cloud()}]));

        expect(records).toHaveLength(1);
        expect(records[0].label).toBe('cloud-eu');
        expect(dropped).toHaveLength(1);
        expect(dropped[0].reason).toMatch(/re-derive/)
    });

    test('malformed envelopes still fail OPEN to empty — the switcher must never brick', () => {
        // Unchanged contract: every envelope failure yields an empty roster and no throw. What
        // changed is only whether the caller can TELL them apart, never whether they fail open.
        for (const value of ['{not json', '{"a": 1}', null, undefined, '']) {
            const result = reviveInstanceRoster(value);

            expect(result.records).toEqual([]);
            expect(result.dropped).toEqual([])
        }
    });

    test('#17368: the envelope names its own outcome — fail-open and fail-SILENT are different things', () => {
        // The defect: an envelope failure yields an EMPTY `dropped`, so the caller's per-row warning
        // has nothing to warn about. The operator sees one seeded instance and a UI indistinguishable
        // from a fresh install, while every roster row they configured is gone from view.
        expect(reviveInstanceRoster('{not json').envelope).toBe('unparseable');
        expect(reviveInstanceRoster('{"a": 1}').envelope).toBe('not-an-array');
        expect(reviveInstanceRoster('[]').envelope).toBe('ok')
    });

    test('#17368 CONTROL: an UNSET key reports `absent`, not damage — a warning on every fresh install is one nobody reads', () => {
        // The trap in the obvious three-state shape. `JSON.parse(null)` yields `null` and would land
        // in `not-an-array`; `JSON.parse(undefined)` throws and would land in `unparseable`. Both are
        // the ordinary first-boot state, so classifying absence BEFORE the parse is what keeps the
        // signal worth reading. Without this arm the arm above passes on a build that cries wolf.
        expect(reviveInstanceRoster(null).envelope).toBe('absent');
        expect(reviveInstanceRoster(undefined).envelope).toBe('absent');

        // Absence is the CARRIER's word, not a falsy family — and this is the boundary the control
        // has to hold from BOTH sides. LocalStorage answers a missing key with `null`, so `''` is a
        // value somebody stored and `JSON.parse('')` throws. Admitting it above would rebuild the
        // exact conflation this envelope exists to remove, one state over.
        expect(reviveInstanceRoster('').envelope).toBe('unparseable')
    });

    test('the storage key is versioned and owned here', () => {
        expect(INSTANCE_ROSTER_STORAGE_KEY).toBe('agentosFleetInstances.v1')
    })
});
