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
    let KindRegistry, FLEET_COCKPIT_EVENT_TYPES;

    test.beforeAll(async () => {
        KindRegistry = (await import('../../../../../../../../apps/agentos/util/KindRegistry.mjs')).default;

        // DERIVE coverage from the DTO source constant — a new event type added there auto-fails
        // the coverage test below until the registry maps it, rather than a hardcoded second list.
        ({FLEET_COCKPIT_EVENT_TYPES} = await import('../../../../../../../../ai/services/fleet/fleetCockpitStatus.mjs'))
    });

    test('every FLEET_COCKPIT_EVENT_TYPES kind resolves to a real --fm-kind-* token (derived from the DTO source)', () => {
        expect(FLEET_COCKPIT_EVENT_TYPES.length).toBeGreaterThan(0);
        for (const kind of FLEET_COCKPIT_EVENT_TYPES) {
            expect(KindRegistry.kindToken(kind), `${kind} must map to a real kind token, not neutral`).not.toBe('--fm-kind-neutral');
            // the axis guard: a kind never resolves onto the --fm-state-* (agent-health) axis
            expect(KindRegistry.kindToken(kind).startsWith('--fm-kind-'), `${kind} must be on the --fm-kind-* axis`).toBe(true)
        }
        // lifecycle-request (the coverage gap the review caught) is in the derived set + resolves
        expect(FLEET_COCKPIT_EVENT_TYPES).toContain('lifecycle-request');
        expect(KindRegistry.kindToken('lifecycle-request')).toBe('--fm-kind-review')
    });

    test('kindToken maps kinds to the --fm-kind-* axis and degrades an unknown kind to neutral', () => {
        expect(KindRegistry.kindToken('pr-activity')).toBe('--fm-kind-pr');
        expect(KindRegistry.kindToken('a2a')).toBe('--fm-kind-a2a');
        expect(KindRegistry.kindToken('review')).toBe('--fm-kind-review');
        expect(KindRegistry.kindToken('work-stall')).toBe('--fm-kind-alert');
        expect(KindRegistry.kindToken('source-degraded')).toBe('--fm-kind-alert');
        expect(KindRegistry.kindToken('some-brand-new-kind')).toBe('--fm-kind-neutral');
        expect(KindRegistry.kindToken(undefined)).toBe('--fm-kind-neutral');
        // prototype-shaped keys must not leak an inherited Object.prototype value past the closed set
        expect(KindRegistry.kindToken('toString')).toBe('--fm-kind-neutral');
        expect(KindRegistry.kindToken('constructor')).toBe('--fm-kind-neutral');
        expect(KindRegistry.kindToken('__proto__')).toBe('--fm-kind-neutral')
    });

    test('kindLabel gives short labels and falls back to the kind string for unknown kinds', () => {
        expect(KindRegistry.kindLabel('lifecycle-request')).toBe('request');
        expect(KindRegistry.kindLabel('work-stall')).toBe('stall');
        expect(KindRegistry.kindLabel('pr-activity')).toBe('pr');
        expect(KindRegistry.kindLabel('a-new-kind')).toBe('a-new-kind');
        // prototype-shaped keys fall back to the literal kind string, never an inherited value
        expect(KindRegistry.kindLabel('toString')).toBe('toString');
        expect(KindRegistry.kindLabel('constructor')).toBe('constructor');
        expect(KindRegistry.kindLabel('__proto__')).toBe('__proto__')
    });
});
