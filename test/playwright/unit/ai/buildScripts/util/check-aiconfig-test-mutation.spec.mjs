import {test, expect}                                           from '@playwright/test';
import {findDbPathMutations, ALLOWLIST, ESCAPE_MARKER}          from '../../../../../../buildScripts/util/check-aiconfig-test-mutation.mjs';

/**
 * Self-test for the Class-A DB-path AiConfig test-mutation guard: the mechanical enforcement of the
 * B4 safety-critical rule — a test must never mutate the shared AiConfig DB paths (the orphan-bleed
 * class). Verifies it flags true DB-path assignments, exempts comparisons / capture-reads /
 * config-varying (Class B) leaves / non-config roots / string + comment context, and honors the
 * inline escape marker.
 */
test.describe('check-aiconfig-test-mutation guard', () => {
    test('flags storagePaths / database / collections / logPath assignments', () => {
        expect(findDbPathMutations('aiConfig.storagePaths.graph = testPath;').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations("aiConfig.engines.chroma.database = `graph-${process.pid}`;").map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('aiConfig.collections.memory = name;').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('aiConfig.data.logPath = tmpLogDir;').map(h => h.line)).toEqual([1])
    });

    test('flags the Memory_Config root and an SDK-prefixed root', () => {
        expect(findDbPathMutations('Memory_Config.data.collections = {};').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('SDK.Memory_Config.data.storagePaths.graph = p;').map(h => h.line)).toEqual([1])
    });

    test('flags a restore-write (restore is itself a B4 mutation)', () => {
        expect(findDbPathMutations('aiConfig.storagePaths.graph = originalGraphPath;').map(h => h.line)).toEqual([1])
    });

    test('flags string-literal bracket access to a dangerous leaf (closes the bypass)', () => {
        expect(findDbPathMutations('aiConfig["storagePaths"].graph = testPath;').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations("aiConfig['engines']['chroma']['database'] = name;").map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('Memory_Config.data["collections"] = {};').map(h => h.line)).toEqual([1]);
        expect(findDbPathMutations('aiConfig.storagePaths["graph"] = testPath;').map(h => h.line)).toEqual([1])
    });

    test('does NOT flag a computed (non-literal) key — out of a static lint reach, by design', () => {
        expect(findDbPathMutations('aiConfig[dbKey] = fakeDb;')).toEqual([]);
        expect(findDbPathMutations('aiConfig[leafName].graph = p;')).toEqual([]);
        // a Class-B leaf via bracket stays out of scope too (transport is not a DB-path leaf)
        expect(findDbPathMutations('aiConfig["transport"] = "sse";')).toEqual([])
    });

    test('does NOT flag a comparison (=== / ==)', () => {
        expect(findDbPathMutations('if (aiConfig.storagePaths.graph === testPath) doThing();')).toEqual([]);
        expect(findDbPathMutations('expect(aiConfig.collections.memory == name).toBe(true);')).toEqual([])
    });

    test('does NOT flag a capture-read (DB path on the RHS)', () => {
        expect(findDbPathMutations('const originalGraphPath = aiConfig.storagePaths.graph;')).toEqual([]);
        expect(findDbPathMutations('const db = aiConfig.engines.chroma.database;')).toEqual([])
    });

    test('does NOT flag a config-VARYING (Class B) leaf — out of scope', () => {
        expect(findDbPathMutations('aiConfig.openAiCompatible.unloadRetryCount = 3;')).toEqual([]);
        expect(findDbPathMutations('aiConfig.transport = "sse";')).toEqual([]);
        expect(findDbPathMutations('SDK.Memory_Config.data.embeddingProvider = "openAiCompatible";')).toEqual([])
    });

    test('does NOT flag a non-config root with a same-named leaf', () => {
        expect(findDbPathMutations('myService.database = fakeDb;')).toEqual([]);
        expect(findDbPathMutations('record.collections = [];')).toEqual([])
    });

    test('does NOT flag a leaf whose name merely starts with a dangerous token', () => {
        expect(findDbPathMutations('aiConfig.collectionsCount = 5;')).toEqual([]);
        expect(findDbPathMutations('aiConfig.databaseUrl = url;')).toEqual([])
    });

    test('does NOT flag a mutation that lives inside a string literal', () => {
        expect(findDbPathMutations("const sample = 'aiConfig.storagePaths.graph = x';")).toEqual([]);
        expect(findDbPathMutations('log(`set aiConfig.collections.memory = ${name}`);')).toEqual([])
    });

    test('does NOT flag a mutation inside a // line or /* block */ comment', () => {
        expect(findDbPathMutations('// aiConfig.storagePaths.graph = x (legacy note)')).toEqual([]);
        expect(findDbPathMutations([
            '/**',
            ' * aiConfig.engines.chroma.database = foo — described, not executed.',
            ' */',
            'const x = 1;'
        ].join('\n'))).toEqual([])
    });

    test('honors the inline escape marker on a genuinely unavoidable line', () => {
        expect(findDbPathMutations(`aiConfig.storagePaths.graph = p; // ${ESCAPE_MARKER}: legacy shim, migrates in #12435`)).toEqual([])
    });

    test('the grandfather allowlist is populated (the ratchet bites only new offenders)', () => {
        expect(ALLOWLIST.size).toBeGreaterThan(0);
        expect(ALLOWLIST.has('test/playwright/unit/ai/services/memory-core/DatabaseService.backupPath.spec.mjs')).toBe(true)
    })
});
