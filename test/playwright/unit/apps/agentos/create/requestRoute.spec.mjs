import {setup} from '../../../../setup.mjs';

const appName = 'KeeperRequestRouteTest';

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

test.describe('keeper request→blueprint route + the ONE shared validator (constrained-blueprint safety contract v2)', () => {
    let schema, route;

    const validGrid = () => ({
        schema: 'grid@1',
        title : 'People',
        config: {columns: [{field: 'name', text: 'Name'}, {field: 'city', text: 'City'}]},
        data  : [{name: 'A', city: 'B'}, {name: 'C', city: 'D'}]
    });

    test.beforeAll(async () => {
        schema = await import('../../../../../../apps/agentos/view/create/util/blueprintSchema.mjs');
        route  = await import('../../../../../../apps/agentos/view/create/util/requestRoute.mjs');
    });

    test('a well-formed grid@1 blueprint validates and routes end-to-end', async () => {
        expect(schema.validateBlueprint(validGrid())).toEqual({accepted: true, reason: null});

        const result = await route.routeCreationRequest({request: 'build me a neo grid', generate: async () => validGrid()});

        expect(result.accepted).toBe(true);
        expect(result.blueprint.schema).toBe('grid@1');
        expect(result.stage).toBeNull();
    });

    test('the attack suite is refused on the shared validator (contract §5)', () => {
        const cases = [
            [{...validGrid(), config: {columns: [{field: 'x', text: 'X'}], renderer: () => {}}}, 'allowlist'],          // (a) function via non-allowlisted key
            [{...validGrid(), config: {columns: [{field: 'x', text: 'X', html: '<img onerror=1>'}]}}, 'forbidden key'], // (b) html key injection, nested
            [{...validGrid(), schema: 'iframe@1'}, 'unregistered'],                                                     // (c) unknown schema
            [{...validGrid(), vdom: {}}, 'unexpected top-level'],                                                       // (d) unknown top-level key
            [{...validGrid(), config: {columns: [{field: 'x', text: 'X', listeners: {}}]}}, 'forbidden key'],           // (e) handler smuggling, nested
            [{...validGrid(), data: [{name: () => {}}]}, 'function value']                                              // (f) deep function value
        ];

        for (const [payload, reasonFragment] of cases) {
            const result = schema.validateBlueprint(payload);

            expect(result.accepted).toBe(false);
            expect(result.reason.toLowerCase()).toContain(reasonFragment.toLowerCase());
        }
    });

    test('mutations run merge-then-validate — no state creation could not reach (§4)', () => {
        const current = validGrid();

        // config shallow-merges: "make it taller" preserves columns; the validator returns the merged result
        const taller = schema.validateMutation(current, {config: {height: 400}});
        expect(taller.accepted).toBe(true);
        expect(taller.blueprint.config.height).toBe(400);
        expect(taller.blueprint.config.columns).toEqual(current.config.columns);

        // key-level refusals, unchanged
        expect(schema.validateMutation(current, {config: {renderer: 'x'}}).accepted).toBe(false);
        expect(schema.validateMutation(current, {vdom: {}}).accepted).toBe(false);
        expect(schema.validateMutation(current, {data: [{f: () => {}}]}).accepted).toBe(false);

        // schema-owned SHAPE symmetry: partials that would reach a creation-invalid state are refused
        expect(schema.validateMutation(current, {title: 42}).accepted).toBe(false);
        expect(schema.validateMutation(current, {data: 'not rows'}).accepted).toBe(false);
        expect(schema.validateMutation(current, {data: ['not object']}).accepted).toBe(false);
        expect(schema.validateMutation(current, {config: {columns: ['bad']}}).accepted).toBe(false);

        // a corrupted current blueprint fails closed before any merge
        expect(schema.validateMutation({schema: 'nope@9', title: 'x', config: {}, data: []}, {config: {}}).accepted).toBe(false);
    });

    test('route refusals are staged data, never exceptions', async () => {
        const empty = await route.routeCreationRequest({request: '  ', generate: async () => validGrid()});
        expect(empty).toMatchObject({accepted: false, stage: route.ROUTE_STAGES.REQUEST});

        const oversized = await route.routeCreationRequest({request: 'x'.repeat(2001), generate: async () => validGrid()});
        expect(oversized.reason).toContain('refused, not truncated');

        const noBoundary = await route.routeCreationRequest({request: 'build me a grid'});
        expect(noBoundary).toMatchObject({accepted: false, stage: route.ROUTE_STAGES.BOUNDARY});

        const boundaryThrows = await route.routeCreationRequest({request: 'build me a grid', generate: async () => { throw new Error('provider down'); }});
        expect(boundaryThrows).toMatchObject({accepted: false, stage: route.ROUTE_STAGES.BOUNDARY});
        expect(boundaryThrows.reason).toContain('provider down');

        const badBlueprint = await route.routeCreationRequest({request: 'build me a grid', generate: async () => ({schema: 'grid@1', title: '', config: {}, data: []})});
        expect(badBlueprint).toMatchObject({accepted: false, stage: route.ROUTE_STAGES.VALIDATION});
    });
});
