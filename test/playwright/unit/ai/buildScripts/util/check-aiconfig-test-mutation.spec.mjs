import {test, expect}                                  from '@playwright/test';
import {findDbPathMutations, ALLOWLIST, ESCAPE_MARKER} from '../../../../../../buildScripts/util/check-aiconfig-test-mutation.mjs';

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
        expect(findDbPathMutations('aiConfig["transport"] = "streamable-http";')).toEqual([])
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
        expect(findDbPathMutations('aiConfig.transport = "streamable-http";')).toEqual([]);
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
    });

    /*
     * These pin the classes the predecessor character scanner provably misread — each measured
     * against an acorn oracle over 1911 files before the swap, not imagined. The swap itself was
     * proven behaviour-preserving (0 verdict deltas at all 156 real pattern sites; both checkers
     * byte-identical on the live 844 + 548 file scan), so what follows is the delta that was WORTH
     * having: the classes that were latent, not live.
     */
    test('MASK: a mutation inside a MULTI-LINE template literal is string text, not code', () => {
        // The scanner's `inString` was function-local, so it reset at every newline: line 2 of a
        // template read as executable code and this FLAGGED — a false positive on a documented
        // GraphQL/SQL block. `ai/services/github-workflow/queries/issueQueries.mjs` alone carries
        // ~19,884 characters the scanner misclassified this way.
        expect(findDbPathMutations([
            'const doc = `',
            '  aiConfig.storagePaths.graph = "/tmp/x"',
            '`;'
        ].join('\n'))).toEqual([])
    });

    test('MASK: the executable interior of a ${...} interpolation IS code', () => {
        // The complement of the pin above, and the reason "treat templates as opaque strings" is not
        // a fix: `${...}` executes. The quasi text around it stays string text.
        expect(findDbPathMutations('const x = `${aiConfig.storagePaths.graph = p}`;').map(h => h.line)).toEqual([1])
    });

    test('MASK: a regex literal containing a quote no longer desyncs the rest of its line', () => {
        // THE SAFETY-CRITICAL DIRECTION. The scanner saw the `'` inside `/["']/` as a string opener
        // and never closed it, so everything after on that line masked as string — a real Class-A
        // mutation went SILENTLY UNFLAGGED. A missed B4 is the orphan-bleed mechanism, which is the
        // whole reason this guard exists. (Same-line only: the scanner's per-line reset contained
        // the desync to its own line — which is why a two-line specimen does NOT reproduce it.)
        expect(findDbPathMutations('const re = /["\']/; aiConfig.database = 1;').map(h => h.line)).toEqual([1]);
        // division after a literal must not be mistaken for a regex opening and swallow the suffix
        expect(findDbPathMutations('const half = total / 2; aiConfig.collections.memory = name;').map(h => h.line)).toEqual([1])
    });

    test('MASK: the escape marker cannot corrupt classification of the lines after it', () => {
        // `findDbPathMutations` returns BEFORE calling the mask on an escape-marker line. With the
        // scanner's hand-carried `inBlock`, that skip meant an escape marker on a line that OPENS a
        // block comment left the state stale — and the commented-out mutation below FLAGGED. Using
        // the escape valve corrupted the guard. The whole-file parse deletes the class: comment
        // continuity is a property of the parse now, so no consumer can break it by skipping.
        expect(findDbPathMutations([
            `const a = 1; /* ${ESCAPE_MARKER}: legacy block below`,
            'aiConfig.database = 1;',
            '*/'
        ].join('\n'))).toEqual([])
    });

    test('MASK: an unparseable file fails CLOSED — it over-reports, never silently greens', () => {
        // The branch that matters most and is easiest to get backwards. A file that cannot be
        // tokenized (mid-edit, or a syntax this acorn cannot read) must not mask to all-string: a
        // guard reporting clean because it could not READ the code is the worst failure available to
        // a safety-critical backstop. All-code is the conservative direction.
        //
        // The specimen must be LEXICALLY broken, not grammatically: `acorn.tokenizer` only lexes, so
        // `const x = {{{ ;` tokenizes happily as punctuators and would exercise nothing. An
        // unterminated string is the realistic mid-edit case that actually throws.
        expect(findDbPathMutations([
            'const s = "unterminated',
            'aiConfig.database = 1;'
        ].join('\n')).map(h => h.line)).toEqual([2])
    })
});
