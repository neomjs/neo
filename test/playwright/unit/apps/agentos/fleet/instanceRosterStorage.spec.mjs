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

    test('malformed envelopes fail OPEN to empty: garbage, non-array, and absent values all yield the empty roster', () => {
        expect(reviveInstanceRoster('{not json')).toEqual({records: [], dropped: []});
        expect(reviveInstanceRoster('{"a": 1}')).toEqual({records: [], dropped: []});
        expect(reviveInstanceRoster(null)).toEqual({records: [], dropped: []});
        expect(reviveInstanceRoster(undefined)).toEqual({records: [], dropped: []})
    });

    test('the storage key is versioned and owned here', () => {
        expect(INSTANCE_ROSTER_STORAGE_KEY).toBe('agentosFleetInstances.v1')
    })
});
