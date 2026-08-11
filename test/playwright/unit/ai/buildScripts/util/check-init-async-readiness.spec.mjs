import * as acorn      from 'acorn';
import {test, expect}  from '@playwright/test';
import {readFileSync}  from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    findUnguardedInitAsyncReads,
    membersAssignedInInitAsync,
    REGISTRY,
    requireStyleGuards
} from '../../../../../../buildScripts/util/check-init-async-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
      readRepo = rel => readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * @summary Self-test for the initAsync readiness analyser.
 *
 * The two witnesses below run against the tree AS IT STANDS — no local revert, no fixture standing in
 * for production. That is deliberate: a lint whose red-proof needs the repo mutated cannot run in CI,
 * and this ticket's predecessor was dropped partly for proving itself against fixtures it had shaped.
 */
test.describe('check-init-async-readiness analyser', () => {
    test('WITNESS: fires on a real in-tree unguarded read, with no revert', () => {
        const hits = findUnguardedInitAsyncReads(
            readRepo('ai/services/memory-core/SessionService.mjs'),
            'SessionService.mjs'
        );

        // `memoryCollection` is assigned in initAsync and read here with neither discipline.
        expect(hits.some(hit => hit.method === 'findSessionsToSummarize' && hit.member === 'memoryCollection'),
            'the named witness must be detected against the current tree').toBe(true)
    });

    test('WITNESS: GraphService PASSES without `await this.ready()` — requireDb is recognised, not tolerated', () => {
        const source = readRepo('ai/services/memory-core/GraphService.mjs');

        expect(source.includes('await this.ready()'),
            'the point of this witness is that it passes WITHOUT the ready() discipline').toBe(false);

        expect(findUnguardedInitAsyncReads(source, 'GraphService.mjs'), 'requireDb() must be credited').toEqual([])
    });

    test('the population is DERIVED from the initAsync assignment, not a member-name list', () => {
        const source = 'class X { async initAsync() { this.alpha = 1; if (true) { this.beta = 2 } } }';

        expect([...membersAssignedInInitAsync(parseClassBody(source))].sort()).toEqual(['alpha', 'beta'])
    });

    test('a require-style guard is a method that TESTS the member and THROWS', () => {
        const guarded   = 'class X { async initAsync() { this.db = 1 } requireDb() { if (!this.db) { throw new Error("x") } return this.db } }',
              tolerated = 'class X { async initAsync() { this.db = 1 } maybeDb() { if (!this.db) { return null } return this.db } }';

        expect([...requireStyleGuards(parseClassBody(guarded)).keys()]).toEqual(['db']);
        // An early RETURN is a degraded-return discipline, not a require-style accessor — it guards
        // its own method rather than every consumer, so it must not be credited class-wide.
        expect([...requireStyleGuards(parseClassBody(tolerated)).keys()]).toEqual([])
    });

    /*
     * Each of the four below is a false-positive class this analyser reported before it was corrected.
     * They are kept as controls because every one of them, left uncorrected, would have been recorded
     * as repo debt in the registry — the lint's own narrowness booked as the world's problem. The
     * population moved 59 -> 41 -> 22 -> 19 as they were closed, none by weakening the rule.
     */
    test('CREDITS an optional-chained read — it cannot propagate undefined onward', () => {
        const source = 'class X { async initAsync() { this.writer = 1 } flush() { this.writer?.publish() } }';

        expect(findUnguardedInitAsyncReads(source)).toEqual([])
    });

    test('CREDITS a degraded early return — `if (!this.db) return`', () => {
        const source = 'class X { async initAsync() { this.db = 1 } read() { if (!this.db) return null; return this.db.query() } }';

        expect(findUnguardedInitAsyncReads(source)).toEqual([])
    });

    test('CREDITS a COMPOUND guard — `if (!enabled || !this.db) return`', () => {
        // Named in this ticket's history as a class that defeated the regex predecessor. The first
        // version of this parse had the same hole: it only read a BARE `!this.db` test.
        const source = 'class X { async initAsync() { this.db = 1 } log(on) { if (!on || !this.db) return null; return this.db.write() } }';

        expect(findUnguardedInitAsyncReads(source)).toEqual([])
    });

    test('does NOT report the guard for the act of guarding', () => {
        // `ensureSchema()`'s own `if (!this.db) return` was reported AT the `if` line. A guard that
        // reports guarding reads as noise and gets switched off.
        const source = 'class X { async initAsync() { this.db = 1 } ensureSchema() { if (!this.db) return; this.db.exec("x") } }';

        expect(findUnguardedInitAsyncReads(source)).toEqual([])
    });

    test('CREDITS `await this.ready()` earlier in the method', () => {
        const source = 'class X { async initAsync() { this.db = 1 } async read() { await this.ready(); return this.db.query() } }';

        expect(findUnguardedInitAsyncReads(source)).toEqual([])
    });

    test('still FIRES when no discipline is present', () => {
        const source = 'class X { async initAsync() { this.db = 1 } read() { return this.db.query() } }';

        expect(findUnguardedInitAsyncReads(source).map(hit => `${hit.method}/${hit.member}`)).toEqual(['read/db'])
    });

    test('every registry entry carries a reason, and every key still resolves to a real read', () => {
        expect(REGISTRY.size, 'the baseline to shrink').toBeGreaterThan(0);

        for (const [key, reason] of REGISTRY) {
            expect(typeof reason, `${key} must carry a reason`).toBe('string');
            expect(reason.length, `${key}: a bare list is not acceptable`).toBeGreaterThan(60)
        }

        // A stale key is a silent exemption on a read nothing can reach again.
        const stale = [...REGISTRY.keys()].filter(key => {
            const [file, method, member] = key.split('::');

            return !findUnguardedInitAsyncReads(readRepo(file), file)
                .some(hit => hit.method === method && hit.member === member)
        });

        expect(stale, 'registry entries whose read no longer exists — delete them').toEqual([])
    });
});

/**
 * @summary Parses one source string and returns its first `ClassBody` node.
 * @param {String} source
 * @returns {Object}
 */
function parseClassBody(source) {
    // Deliberately re-parsed here rather than exported from the lint: these tests assert on the
    // analyser's PUBLIC helpers, and a shared private parser would let a change to it pass unnoticed.
    const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});

    let found = null;

    (function walk(node) {
        if (!node || typeof node !== 'object' || found) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.type === 'ClassBody') { found = node; return }
        Object.keys(node).forEach(key => walk(node[key]))
    })(ast);

    return found
}
