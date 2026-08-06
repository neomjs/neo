import {test, expect}       from '@playwright/test';
import fs                   from 'fs';
import path                 from 'path';
import {loadClassHierarchy} from '../../../../../../ai/services/knowledge-base/helpers/classHierarchyContract.mjs';

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
