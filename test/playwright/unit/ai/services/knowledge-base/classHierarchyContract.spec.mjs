import {test, expect} from '@playwright/test';
import fs             from 'fs';
import path           from 'path';

import {
    assertCoverageBaseline,
    INTERIM_COVERAGE_BASELINE,
    loadClassHierarchy
} from '../../../../../../ai/services/knowledge-base/helpers/classHierarchyContract.mjs';

/**
 * The class hierarchy is an IDENTITY input: `extends` is hashed into every chunk id, so a degraded
 * load re-identifies the whole corpus and arms stale-deletion against it. These assert the REFUSAL
 * rather than the happy path, because the defect was a successful ingest.
 *
 * The helper takes `hierarchyPath` as a parameter, which is what makes this testable without
 * assigning to a shared config leaf and restoring it in teardown.
 */
test.describe('loadClassHierarchy — fail-closed on a degraded identity input (#16600)', () => {
    let tmpDir;

    test.beforeAll(() => {
        tmpDir = path.resolve(process.cwd(), 'tmp', `kb-hierarchy-contract-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
    });

    test.afterAll(() => {
        fs.rmSync(tmpDir, {force: true, recursive: true});
    });

    const writeFixture = (name, contents) => {
        const target = path.join(tmpDir, name);
        fs.writeFileSync(target, contents, 'utf8');
        return target
    };

    test('refuses when the file is absent, and names the resolved path', async () => {
        const missing = path.join(tmpDir, 'does-not-exist.json');

        const error = await loadClassHierarchy({hierarchyPath: missing, sourcePathCount: 5})
            .then(() => null, e => e);

        expect(error).not.toBeNull();
        expect(error.code).toBe('CLASS_HIERARCHY_UNREADABLE');
        // The path must appear verbatim: the incident was a plane mismatch, and a message that omits
        // WHICH path was read cannot distinguish "not built" from "not on this plane".
        expect(error.message).toContain(missing);
    });

    test('refuses when the file is malformed rather than missing', async () => {
        const broken = writeFixture('malformed.json', '{"Neo.component.Base": ');

        const error = await loadClassHierarchy({hierarchyPath: broken, sourcePathCount: 5})
            .then(() => null, e => e);

        expect(error?.code).toBe('CLASS_HIERARCHY_UNREADABLE');
    });

    test('refuses a readable-but-EMPTY map while source paths are configured', async () => {
        // The quieter half of the same bug: the read succeeds, so a `try/catch` guard alone would
        // let this through and every chunk would take a new id under an empty `extends`.
        const empty = writeFixture('empty.json', '{}');

        const error = await loadClassHierarchy({hierarchyPath: empty, sourcePathCount: 5})
            .then(() => null, e => e);

        expect(error?.code).toBe('CLASS_HIERARCHY_EMPTY');
        expect(error.message).toContain('5 source path(s)');
    });

    test('CONTROL — an empty map is permitted when there is nothing to index', async () => {
        // Negative control proving the guard is narrow rather than "empty is always fatal". With zero
        // source paths there is no chunk whose identity could be degraded, so this is a legitimate
        // empty state and must NOT refuse.
        const empty = writeFixture('empty-control.json', '{}');

        await expect(loadClassHierarchy({hierarchyPath: empty, sourcePathCount: 0})).resolves.toEqual({});
    });

    test('CONTROL — a populated map loads and returns its entries unchanged', async () => {
        const populated = writeFixture('populated.json', JSON.stringify({
            'Neo.component.Base': 'Neo.component.Abstract',
            'Neo.container.Base': 'Neo.component.Base',
            'Neo.core.Base'     : null
        }));

        const hierarchy = await loadClassHierarchy({hierarchyPath: populated, sourcePathCount: 5});

        // The exact value whose absence caused the incident.
        expect(hierarchy['Neo.component.Base']).toBe('Neo.component.Abstract');
        expect(Object.keys(hierarchy)).toHaveLength(3);
    });

    test('refuses a non-object JSON payload instead of treating it as a map', async () => {
        // `[]` and `null` parse fine and would each read as "empty" to an `Object.keys()` check, or
        // surface later as an unrelated parser symptom. The refusal must name the artifact.
        for (const [name, contents] of [['array.json', '[]'], ['null.json', 'null']]) {
            const fixture = writeFixture(name, contents);

            const error = await loadClassHierarchy({hierarchyPath: fixture, sourcePathCount: 5})
                .then(() => null, e => e);

            expect(error?.code, `${name} must refuse`).toBe('CLASS_HIERARCHY_EMPTY');
        }
    });
});

test.describe('assertCoverageBaseline — a regression fails, standing debt does not', () => {
    // The measured live shape, spanning the three cases the reviewer required: a near-fully-covered
    // root, a zero-coverage root, and an app root the generator's registry does not reach.
    //
    // These are the PARSER-CANONICAL numbers — a runtime walk of `sourcePaths.ApiSource` with class
    // extraction taken from `SourceParser` (acorn's `ClassDeclaration.superClass`). An earlier draft
    // of this fixture carried numbers from a separately reimplemented regex scan and disagreed on two
    // roots (`src` 403 vs 404, `ai` /170 vs /171). Two independent implementations now agree on all
    // five, which is the only reason these are safe to encode.
    const liveShape = {
        'src'     : {declared: 405, resolved: 404},
        'apps'    : {declared: 358, resolved: 336},
        'examples': {declared: 259, resolved: 0},
        'docs/app': {declared: 17,  resolved: 4},
        'ai'      : {declared: 171, resolved: 127}
    };

    test('the live shape passes — standing debt is within floor, so recovery is not blocked', () => {
        const rows = assertCoverageBaseline({coverage: liveShape});

        expect(rows).toHaveLength(5);
        expect(rows.find(r => r.root === 'examples')).toMatchObject({declared: 259, resolved: 0, ratio: 0});
    });

    test('src collapsing to zero FAILS — the incident that motivated all of this', () => {
        // 96.42% -> 0% is exactly what happened when the artifact left the plane, and every check
        // passed. This is the assertion that would have caught it.
        const error = (() => {
            try {
                assertCoverageBaseline({coverage: {...liveShape, src: {declared: 405, resolved: 0}}});
                return null;
            } catch (e) { return e }
        })();

        expect(error?.code).toBe('CLASS_HIERARCHY_COVERAGE_REGRESSION');
        expect(error.message).toContain('src 0/405');
        expect(error.message).toContain('floor 99.0%');
    });

    test('an OUTSIDE-REGISTRY app class dropping apps below floor FAILS', () => {
        // `apps` is partially covered because the generator walks a registry-defined subset. A class
        // outside that registry is the realistic regression vector for this root.
        const error = (() => {
            try {
                assertCoverageBaseline({coverage: {...liveShape, apps: {declared: 358, resolved: 300}}});
                return null;
            } catch (e) { return e }
        })();

        expect(error?.code).toBe('CLASS_HIERARCHY_COVERAGE_REGRESSION');
        expect(error.message).toContain('apps 300/358');
    });

    test('CONTROL — examples staying at 0 does NOT fail, because its floor is 0 named debt', () => {
        // Proves the guard is a regression detector rather than a quality gate. If this threw, the
        // corpus could never be rebuilt.
        expect(() => assertCoverageBaseline({coverage: {examples: {declared: 259, resolved: 0}}})).not.toThrow();
    });

    test('CONTROL — a root with zero declaring classes is omitted, not reported as 100%', () => {
        // An empty measurement must not manufacture a reassuring number.
        const rows = assertCoverageBaseline({coverage: {src: {declared: 0, resolved: 0}}});

        expect(rows).toHaveLength(0);
    });

    test('an unbaselined root is surfaced in the rows rather than silently passing', () => {
        const rows = assertCoverageBaseline({coverage: {'some/new/root': {declared: 10, resolved: 2}}});

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({root: 'some/new/root', floor: undefined});
    });

    test('the baseline is genuinely immutable — asserted by MUTATION, not by Object.isFrozen', () => {
        // `Object.isFrozen` on a Set returns true while `add`/`delete` still mutate it, so asserting
        // the predicate proves nothing on its own. A plain object does resist writes under freeze —
        // this attempts the mutation and checks the value, which is the claim that actually matters.
        expect(Object.isFrozen(INTERIM_COVERAGE_BASELINE)).toBe(true);

        try { INTERIM_COVERAGE_BASELINE['examples'] = 1 } catch (e) { /* strict mode throws; both fine */ }
        try { INTERIM_COVERAGE_BASELINE['injected'] = 1 } catch (e) { /* ditto */ }
        try { delete INTERIM_COVERAGE_BASELINE['src'] }   catch (e) { /* ditto */ }

        expect(INTERIM_COVERAGE_BASELINE.examples).toBe(0);
        expect(INTERIM_COVERAGE_BASELINE.injected).toBeUndefined();
        expect(INTERIM_COVERAGE_BASELINE.src).toBe(0.99);
    });
});
