import {test, expect} from '@playwright/test';
import {detectOverlayShape, diffLeafTrees, isLeafDescriptor, projectLeaf, renderOverlayModule,
        renderValue, stableStringify} from '../../../../ai/scripts/setup/migrateConfigOverlay.mjs';

/**
 * Pure-helper coverage for the snapshot→subclass overlay migration. The CLI wrapper stays thin
 * (file I/O + module imports); everything decision-shaped is exercised here without touching disk.
 * The diff operates on DECLARED leaf descriptors — never env-resolved values — so the machine's
 * env can neither fake nor mask a delta. Fixtures mirror the REAL `leaf()` return shape:
 * `{default, env, ...metadataSpread, type, parse: Function|null}` — `parse` is DERIVED (a function
 * on every env-bound leaf) and must never influence equality.
 */
test.describe('ai/scripts/setup/migrateConfigOverlay — declaration-level diff + rendering', () => {
    const leafD = (dflt, env = null, type = null, metadata = null) =>
        ({default: dflt, env, ...(metadata || {}), type, parse: env ? () => {} : null});

    test('isLeafDescriptor: descriptor vs subtree vs primitives', () => {
        expect(isLeafDescriptor(leafD(1))).toBe(true);
        expect(isLeafDescriptor({nested: leafD(1)})).toBe(false);
        expect(isLeafDescriptor(null)).toBe(false);
        expect(isLeafDescriptor([1])).toBe(false);
        expect(isLeafDescriptor('x')).toBe(false);
    });

    test('stableStringify: key-order independence + function refusal', () => {
        expect(stableStringify({b: 1, a: 2})).toBe(stableStringify({a: 2, b: 1}));
        expect(stableStringify({fn: () => {}})).toBe(undefined);
    });

    test('diffLeafTrees: unchanged leaves vanish; changed leaves become deltas', () => {
        const base    = {transport: leafD('stdio', 'NEO_TRANSPORT', 'string'), debug: leafD(false, 'NEO_DEBUG', 'boolean')},
              overlay = {transport: leafD('streamable-http', 'NEO_TRANSPORT', 'string'), debug: leafD(false, 'NEO_DEBUG', 'boolean')},
              result  = diffLeafTrees(base, overlay);

        // The delta carries the overlay's descriptor object VERBATIM (same reference — parse and all).
        expect(result.deltas).toEqual({transport: overlay.transport});
        expect(result.deltas.transport.default).toBe('streamable-http');
        expect(result.drift).toEqual([]);
        expect(result.skipped).toEqual([]);
    });

    test('diffLeafTrees: base leaves ABSENT from the snapshot are the drift report (the retired defect)', () => {
        const base    = {a: leafD(1), fresh: leafD('added-after-copy'), nested: {inner: leafD(2), newer: leafD(3)}},
              overlay = {a: leafD(1), nested: {inner: leafD(2)}},
              result  = diffLeafTrees(base, overlay);

        expect(result.drift.sort()).toEqual(['fresh', 'nested.newer']);
        expect(result.deltas).toEqual({});
    });

    test('diffLeafTrees: operator-custom keys carry verbatim; non-renderable diffs are skipped+reported', () => {
        const base    = {known: leafD(1), fn: {default: () => {}, env: null, type: null, metadata: null}},
              overlay = {known: leafD(1), custom: leafD('mine', 'NEO_CUSTOM', 'string'), fn: {default: () => 'changed', env: null, type: null, metadata: null}},
              result  = diffLeafTrees(base, overlay);

        expect(result.custom).toEqual(['custom']);
        expect(result.deltas.custom).toBe(overlay.custom);
        expect(result.skipped).toEqual(['fn']);
        expect(result.deltas.fn).toBe(undefined);
    });

    test('diffLeafTrees: key-order differences in descriptors are NOT deltas', () => {
        const base    = {x: {default: 1, env: 'E', type: 'number', parse: () => {}}},
              overlay = {x: {type: 'number', env: 'E', default: 1, parse: () => {}}};

        expect(diffLeafTrees(base, overlay).deltas).toEqual({});
    });

    test('diffLeafTrees: distinct derived parse functions never read as deltas (projection excludes parse)', () => {
        const base    = {x: leafD(5, 'NEO_X', 'number')},
              overlay = {x: leafD(5, 'NEO_X', 'number')};

        // Two separate leaf() calls carry two distinct parse function identities — still equal.
        expect(base.x.parse).not.toBe(overlay.x.parse);
        expect(diffLeafTrees(base, overlay).deltas).toEqual({});
        expect(diffLeafTrees(base, overlay).skipped).toEqual([]);
    });

    test('projectLeaf: reconstructs spread metadata and drops parse', () => {
        const descriptor             = leafD('', 'NEO_URL', 'string', {requiredFor: [{modes: ['gitlab-pat']}]}),
              {projection, metadata} = projectLeaf(descriptor);

        expect(metadata).toEqual({requiredFor: [{modes: ['gitlab-pat']}]});
        expect(projection.metadata).toEqual(metadata);
        expect(Object.hasOwn(projection, 'parse')).toBe(false);
    });

    test('renderValue: leaf calls render minimal-arity; nested trees indent', () => {
        expect(renderValue({default: true, env: null, type: null})).toBe('leaf(true)');
        expect(renderValue({default: 5, env: 'NEO_X', type: 'number'})).toBe(`leaf(5, "NEO_X", "number")`);
        expect(renderValue({default: null, env: 'NEO_Y', type: null})).toBe(`leaf(null, "NEO_Y")`);

        const nested = renderValue({ollama: {model: {default: 'm', env: null, type: null}}}, '        ');
        expect(nested).toContain('ollama:');
        expect(nested).toContain('leaf("m")');
    });

    test('renderOverlayModule: zero deltas → clean singleton subclass without a data block', () => {
        const source = renderOverlayModule({});

        expect(source).toContain('class Config extends ConfigBase');
        expect(source).toContain(`className: 'Neo.ai.Config'`);
        expect(source).toContain('singleton: true');
        expect(source).not.toContain('data:');
        expect(detectOverlayShape(source)).toBe('subclass');
    });

    test('renderOverlayModule: deltas render as a data block of leaf() declarations', () => {
        const source = renderOverlayModule({debug: {default: true, env: 'NEO_DEBUG', type: 'boolean'}});

        expect(source).toContain('data: {');
        expect(source).toContain(`debug: leaf(true, "NEO_DEBUG", "boolean")`);
    });

    test('detectOverlayShape: snapshot copies classify as snapshot', () => {
        expect(detectOverlayShape(`class Config extends ConfigProvider { static config = {} }`)).toBe('snapshot');
        expect(detectOverlayShape(`import ConfigBase from './configBase.mjs';\nclass Config extends ConfigBase {}`)).toBe('subclass');
    });
});
