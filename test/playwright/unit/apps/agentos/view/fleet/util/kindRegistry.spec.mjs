import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetKindRegistryTest';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

test.describe('Fleet event-kind registry — derived DTO coverage + --fm-kind-* axis (#14639)', () => {
    let kindToken, kindLabel, FLEET_COCKPIT_EVENT_TYPES;

    test.beforeAll(async () => {
        const reg = await import('../../../../../../../../apps/agentos/util/kindRegistry.mjs');

        kindToken = reg.kindToken;
        kindLabel = reg.kindLabel;

        // DERIVE coverage from the DTO source constant — a new event type added there auto-fails
        // the coverage test below until the registry maps it, rather than a hardcoded second list.
        ({FLEET_COCKPIT_EVENT_TYPES} = await import('../../../../../../../../ai/services/fleet/fleetCockpitStatus.mjs'))
    });

    test('every FLEET_COCKPIT_EVENT_TYPES kind resolves to a real --fm-kind-* token (derived from the DTO source)', () => {
        expect(FLEET_COCKPIT_EVENT_TYPES.length).toBeGreaterThan(0);
        for (const kind of FLEET_COCKPIT_EVENT_TYPES) {
            expect(kindToken(kind), `${kind} must map to a real kind token, not neutral`).not.toBe('--fm-kind-neutral');
            // the axis guard: a kind never resolves onto the --fm-state-* (agent-health) axis
            expect(kindToken(kind).startsWith('--fm-kind-'), `${kind} must be on the --fm-kind-* axis`).toBe(true)
        }
        // lifecycle-request (the coverage gap the review caught) is in the derived set + resolves
        expect(FLEET_COCKPIT_EVENT_TYPES).toContain('lifecycle-request');
        expect(kindToken('lifecycle-request')).toBe('--fm-kind-review')
    });

    test('kindToken maps kinds to the --fm-kind-* axis and degrades an unknown kind to neutral', () => {
        expect(kindToken('pr-activity')).toBe('--fm-kind-pr');
        expect(kindToken('a2a')).toBe('--fm-kind-a2a');
        expect(kindToken('review')).toBe('--fm-kind-review');
        expect(kindToken('work-stall')).toBe('--fm-kind-alert');
        expect(kindToken('source-degraded')).toBe('--fm-kind-alert');
        expect(kindToken('some-brand-new-kind')).toBe('--fm-kind-neutral');
        expect(kindToken(undefined)).toBe('--fm-kind-neutral');
        // prototype-shaped keys must not leak an inherited Object.prototype value past the closed set
        expect(kindToken('toString')).toBe('--fm-kind-neutral');
        expect(kindToken('constructor')).toBe('--fm-kind-neutral');
        expect(kindToken('__proto__')).toBe('--fm-kind-neutral')
    });

    test('kindLabel gives short labels and falls back to the kind string for unknown kinds', () => {
        expect(kindLabel('lifecycle-request')).toBe('request');
        expect(kindLabel('work-stall')).toBe('stall');
        expect(kindLabel('pr-activity')).toBe('pr');
        expect(kindLabel('a-new-kind')).toBe('a-new-kind');
        // prototype-shaped keys fall back to the literal kind string, never an inherited value
        expect(kindLabel('toString')).toBe('toString');
        expect(kindLabel('constructor')).toBe('constructor');
        expect(kindLabel('__proto__')).toBe('__proto__')
    });
});
