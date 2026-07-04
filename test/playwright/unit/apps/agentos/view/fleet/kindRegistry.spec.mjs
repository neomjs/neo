import {setup} from '../../../../../setup.mjs';

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
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

test.describe('Fleet event-kind registry — DTO coverage + palette + neutral fallback (#14639)', () => {
    let kindToken, kindLabel;

    test.beforeAll(async () => {
        const reg = await import('../../../../../../../apps/agentos/view/fleet/kindRegistry.mjs');

        kindToken = reg.kindToken;
        kindLabel = reg.kindLabel
    });

    test('every FLEET_COCKPIT_EVENT_TYPES kind resolves (none falls through to neutral) — incl lifecycle-request', () => {
        const dtoKinds = [
            'lifecycle-request', 'lifecycle-success', 'lifecycle-failure', 'bridge-unavailable',
            'bridge-gated', 'pr-activity', 'issue-activity', 'lane-claim', 'work-stall', 'source-degraded'
        ];
        for (const kind of dtoKinds) {
            expect(kindToken(kind), `${kind} must map to a real token`).not.toBe('--fm-state-off')
        }
        // lifecycle-request (the coverage gap the review caught) resolves as a pending/attention tone
        expect(kindToken('lifecycle-request')).toBe('--fm-state-idle')
    });

    test('kindToken maps the palette groups and degrades an unknown kind to neutral', () => {
        expect(kindToken('pr-activity')).toBe('--fm-state-ok');
        expect(kindToken('a2a')).toBe('--fm-signal');
        expect(kindToken('review')).toBe('--fm-state-idle');
        expect(kindToken('work-stall')).toBe('--fm-state-wedged');
        expect(kindToken('source-degraded')).toBe('--fm-state-limited');
        expect(kindToken('some-brand-new-kind')).toBe('--fm-state-off');
        expect(kindToken(undefined)).toBe('--fm-state-off')
    });

    test('kindLabel gives short labels and falls back to the kind string for unknown kinds', () => {
        expect(kindLabel('lifecycle-request')).toBe('request');
        expect(kindLabel('work-stall')).toBe('stall');
        expect(kindLabel('pr-activity')).toBe('pr');
        expect(kindLabel('a-new-kind')).toBe('a-new-kind')
    });
});
