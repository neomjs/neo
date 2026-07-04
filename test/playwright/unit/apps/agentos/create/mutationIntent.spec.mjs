import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'MutationIntentTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('mutationIntent — bounded follow-up grammar + registry target resolution (#14763)', () => {
    let parseMutationIntent, resolveMutationTarget;

    const createRegistryDouble = records => ({
        items: records,
        resolveTarget(selector={}) {
            if (selector.instanceId) {
                return records.find(record => record.instanceId === selector.instanceId) || null
            }

            let candidate = null;
            records.forEach(record => {
                if (record.state === 'live'
                    && (selector.title === undefined || record.title === selector.title)
                    && (!candidate || record.creationIndex > candidate.creationIndex)
                ) {
                    candidate = record
                }
            });

            return candidate
        }
    });

    test.beforeAll(async () => {
        ({parseMutationIntent, resolveMutationTarget} = await import('../../../../../../apps/agentos/view/create/util/mutationIntent.mjs'))
    });

    test('parses the three v1 intent classes to mutation allowlist shapes', () => {
        expect(parseMutationIntent('make it taller')).toEqual({
            accepted: true,
            selector: {},
            mutation: {config: {height: 520}},
            reason  : null,
            stage   : null
        });

        expect(parseMutationIntent('make the sales grid wider')).toEqual({
            accepted: true,
            selector: {title: 'Sales Grid'},
            mutation: {config: {width: 720}},
            reason  : null,
            stage   : null
        });

        expect(parseMutationIntent('rename the sales grid to Q3 Metrics')).toEqual({
            accepted: true,
            selector: {title: 'Sales Grid'},
            mutation: {title: 'Q3 Metrics'},
            reason  : null,
            stage   : null
        });

        expect(parseMutationIntent('replace data with [{"item":"A"},{"item":"B"}]')).toEqual({
            accepted: true,
            selector: {},
            mutation: {data: [{item: 'A'}, {item: 'B'}]},
            reason  : null,
            stage   : null
        })
    });

    test('refuses unknown, overlong, markup, and non-row data inputs', () => {
        expect(parseMutationIntent('spin it around').accepted).toBe(false);
        expect(parseMutationIntent('make it <b>bigger</b>').reason).toContain('plain text');
        expect(parseMutationIntent('make ' + 'x'.repeat(241)).accepted).toBe(false);
        expect(parseMutationIntent('replace data with {"item":"A"}').reason).toContain('JSON array');
        expect(parseMutationIntent('replace data with ["A"]').reason).toContain('row objects')
    });

    test('resolves explicit titles, latest-live fallback, and ambiguous title refusals', () => {
        const registry = createRegistryDouble([
            {instanceId: 'grid-1', title: 'Sales Grid', creationIndex: 1, state: 'live'},
            {instanceId: 'grid-2', title: 'People Grid', creationIndex: 2, state: 'live'},
            {instanceId: 'grid-3', title: 'Old Grid', creationIndex: 3, state: 'disposed'}
        ]);

        expect(resolveMutationTarget({registry, selector: {title: 'sales grid'}}).record.instanceId).toBe('grid-1');
        expect(resolveMutationTarget({registry, selector: {}}).record.instanceId).toBe('grid-2');
        expect(resolveMutationTarget({registry, selector: {title: 'Old Grid'}}).accepted).toBe(false);

        const ambiguous = createRegistryDouble([
            {instanceId: 'sales-1', title: 'Sales Grid', creationIndex: 1, state: 'live'},
            {instanceId: 'sales-2', title: 'Sales Grid', creationIndex: 2, state: 'live'}
        ]);

        const result = resolveMutationTarget({registry: ambiguous, selector: {title: 'Sales Grid'}});

        expect(result.accepted).toBe(false);
        expect(result.reason).toContain('ambiguous');
        expect(result.reason).toContain('sales-1');
        expect(result.reason).toContain('sales-2')
    });
});
