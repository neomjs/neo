import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import {
    classifyLine,
    deferredMembersOf,
    diffRegistry,
    discoverViolations,
    findMethodRanges,
    isGuardTestLine,
    methodAt,
    readShape,
    registryGrowthProblems,
    typedGuardMembers,
    unresolvedWitnessPaths,
    validateEntry
} from '../../../../../../ai/scripts/lint/lint-deferred-member-readiness.mjs';

const
    ROOT_DIR = path.resolve(process.cwd()),
    REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'ai/scripts/lint/deferred-member-registry.json'), 'utf8')),
    SITES    = REGISTRY.sites,
    LIVE     = discoverViolations({rootDir: ROOT_DIR}),

    RED_CASE     = 'ai/services/memory-core/SessionService.mjs#findSessionsToSummarize:memoryCollection',
    SESSION_FILE = path.join(ROOT_DIR, 'ai/services/memory-core/SessionService.mjs'),
    GRAPH_FILE   = path.join(ROOT_DIR, 'ai/services/memory-core/GraphService.mjs');

/**
 * @param {String} file Absolute path.
 * @returns {String[]}
 */
function linesOf(file) {
    return fs.readFileSync(file, 'utf8').split('\n')
}

test.describe('lint-deferred-member-readiness — two disciplines, derived population (#16644)', () => {
    test('the live tree is fully accepted, and the population is non-trivial', () => {
        // The non-vacuity control. Every RED proof below works by REMOVING something from a green
        // baseline, so a baseline of zero violations would make all of them pass against a predicate
        // that discovers nothing at all.
        expect(LIVE.length).toBeGreaterThan(20);

        const {unregistered, stale, invalid, drifted} = diffRegistry({violations: LIVE, registry: SITES});

        expect(unregistered).toEqual([]);
        expect(stale).toEqual([]);
        expect(invalid).toEqual([]);
        expect(drifted).toEqual([]);
    });

    /**
     * AC: the lint fires on a REAL in-tree unguarded read, proven without mutating the repo.
     *
     * A lint never observed failing is not a guard. The proof removes the red case's registry entry
     * in memory — the tree is untouched, so this runs in CI and in parallel.
     */
    test('RED — the acceptance criteria\'s named site fires when unregistered', () => {
        const live = LIVE.find(v => v.key === RED_CASE);

        expect(live, `${RED_CASE} must be discovered in the tree as it stands`).toBeTruthy();
        expect(live.shape).toBe('bare-read');
        expect(live.file).toBe('ai/services/memory-core/SessionService.mjs');

        const withoutRedCase = {...SITES};
        delete withoutRedCase[RED_CASE];

        const {unregistered} = diffRegistry({violations: LIVE, registry: withoutRedCase});

        expect(unregistered.map(v => v.key)).toContain(RED_CASE);
    });

    /**
     * The regression this spec exists for most.
     *
     * The first revision matched a method's parameter list with `\([^)]*\)`, which stops at the FIRST
     * `)`. `findSessionsToSummarize({now = Date.now()} = {})` has one inside a default value, so the
     * method was invisible, and the lint ran CLEAN over the exact defect the ticket names. The bug was
     * caught only by checking the output against the named case rather than against the total — a
     * total of 37 looked entirely healthy.
     */
    test('a method whose default parameter contains a call is still found', () => {
        const ranges = findMethodRanges(linesOf(SESSION_FILE));

        expect(ranges.map(r => r.name)).toContain('findSessionsToSummarize');

        const synthetic = [
            'class Probe {',
            '    async initAsync() {',
            '        this.store = await build();',
            '    }',
            '    async query({now = Date.now(), limit = cap()} = {}) {',
            '        return this.store.get(now, limit);',
            '    }',
            '}'
        ];

        expect(findMethodRanges(synthetic).map(r => r.name)).toContain('query');
    });

    /**
     * AC: `GraphService` passes WITHOUT `await this.ready()`, proving the `requireDb()` discipline is
     * recognised rather than merely tolerated.
     *
     * The second assertion is the control that makes the first mean anything: if GraphService simply
     * awaited readiness, or had no deferred member, it would pass for a reason that says nothing about
     * the typed-guard discipline.
     */
    test('GREEN — GraphService.db passes on the typed-guard discipline alone', () => {
        const source = fs.readFileSync(GRAPH_FILE, 'utf8'),
              lines  = source.split('\n'),
              ranges = findMethodRanges(lines);

        expect(source).not.toContain('await this.ready()');
        expect([...deferredMembersOf(lines, ranges)]).toContain('db');
        expect(typedGuardMembers(lines, ranges).get('db')).toBe('requireDb');

        expect(LIVE.filter(v => v.file.endsWith('GraphService.mjs') && v.member === 'db')).toEqual([]);
    });

    /**
     * And the reason the discipline is recognised at FILE level rather than per read: GraphService
     * defines `requireDb()` once and reads `this.db` directly over a hundred times. A per-read rule
     * would flag the acceptance criteria's own green case into the ground.
     */
    test('the file-level rule is load-bearing — GraphService reads this.db far more often than it guards it', () => {
        const source = fs.readFileSync(GRAPH_FILE, 'utf8'),
              reads  = (source.match(/this\.db\b/g) || []).length,
              guards = (source.match(/requireDb\s*\(/g) || []).length;

        expect(reads).toBeGreaterThan(50);
        expect(guards).toBeLessThan(5);
    });

    /**
     * AC: the population is derived from the `initAsync` ASSIGNMENT, never from a member name. The
     * defect this lint replaces was caused by a hand-written query that shaped its own population.
     */
    test('the population comes from the assignment, not from a name', () => {
        const lines  = linesOf(SESSION_FILE),
              ranges = findMethodRanges(lines);

        expect([...deferredMembersOf(lines, ranges)].sort()).toEqual(['memoryCollection', 'sessionsCollection']);

        // The negative control: the same member names, assigned in construct() instead. A member that
        // is not deferred is not in the population, whatever it is called.
        const notDeferred = [
            'class Probe {',
            '    construct(config) {',
            '        this.memoryCollection = buildSync();',
            '    }',
            '    async initAsync() {',
            '        await super.initAsync();',
            '    }',
            '}'
        ];

        expect([...deferredMembersOf(notDeferred, findMethodRanges(notDeferred))]).toEqual([]);
    });

    test('an assignment is distinguished from a comparison and an arrow', () => {
        const lines = [
            'class Probe {',
            '    async initAsync() {',
            '        this.real = await build();',
            '        this.compared === other;',
            '        this.arrow => never;',
            '    }',
            '}'
        ];

        expect([...deferredMembersOf(lines, findMethodRanges(lines))]).toEqual(['real']);
    });

    test('one obligation per method+member, however many reads', () => {
        const admitBatch = LIVE.filter(v =>
            v.file.endsWith('CommunityBatchAdmissionService.mjs') && v.method === 'admitBatch' && v.member === 'db');

        expect(admitBatch).toHaveLength(1);
        expect(admitBatch[0].reads).toBeGreaterThan(5);
    });

    test.describe('shape classification', () => {
        test('a guard behind a boolean operator is truthy-skip, not bare-read', () => {
            // The first revision anchored on `if (this.x)` and read this as an unguarded crash risk.
            const body = 'if (!config.enabled || !this.db) return null;\nthis.db.prepare(sql);';

            expect(readShape('this.db.prepare(sql);', body, 'db')).toBe('truthy-skip');
        });

        test('a `this.x && …` guard needs no `if` to count', () => {
            const body = 'this.db && this.db.close();';

            expect(readShape('this.db && this.db.close();', body, 'db')).toBe('truthy-skip');
        });

        test('an unguarded read is bare-read', () => {
            const body = 'const row = this.db.prepare(sql).get();';

            expect(readShape(body, body, 'db')).toBe('bare-read');
        });

        test('an optional chain is its own shape', () => {
            const body = 'return this.loop?.start();';

            expect(readShape(body, body, 'loop')).toBe('optional-chain');
        });

        test('the guard\'s own test line is not cited as the violation', () => {
            expect(isGuardTestLine('if (!this.db) return;', 'db')).toBe(true);
            expect(isGuardTestLine('} else if (this.db) {', 'db')).toBe(true);
            expect(isGuardTestLine('if (this.db.ready) {', 'db')).toBe(false);
            expect(isGuardTestLine('const row = this.db.prepare(sql);', 'db')).toBe(false);
        });
    });

    test.describe('registry mechanics', () => {
        test('RED — an entry without a reason is a suppression, not an acceptance', () => {
            const problems = validateEntry('probe', {shape: 'bare-read', witness: 'ai/Agent.mjs'});

            expect(problems.join(' ')).toContain('reason is required');
        });

        test('RED — an entry without a witness fails', () => {
            const problems = validateEntry('probe', {shape: 'bare-read', reason: 'because'});

            expect(problems.join(' ')).toContain('witness is required');
        });

        test('RED — an unknown shape fails', () => {
            const problems = validateEntry('probe', {shape: 'handwaved', reason: 'r', witness: 'ai/Agent.mjs'});

            expect(problems.join(' ')).toContain('shape must be one of');
        });

        test('RED — a witness naming a file that does not exist is not evidence', () => {
            const problems = unresolvedWitnessPaths('probe', 'see ai/services/GhostService.mjs for the guard');

            expect(problems.join(' ')).toContain('does not exist');
        });

        test('a witness naming a live file resolves', () => {
            expect(unresolvedWitnessPaths('probe', 'see ai/Agent.mjs')).toEqual([]);
        });

        test('RED — a stale entry fails, so the registry must shrink visibly', () => {
            const withGhost = {...SITES, 'ai/Ghost.mjs#gone:member': {shape: 'bare-read', reason: 'r', witness: 'ai/Agent.mjs'}},
                  {stale}   = diffRegistry({violations: LIVE, registry: withGhost});

            expect(stale).toContain('ai/Ghost.mjs#gone:member');
        });

        test('RED — a registered site whose shape changed must be re-examined', () => {
            const flipped   = {...SITES, [RED_CASE]: {...SITES[RED_CASE], shape: 'truthy-skip'}},
                  {drifted} = diffRegistry({violations: LIVE, registry: flipped});

            expect(drifted.join(' ')).toContain(RED_CASE);
            expect(drifted.join(' ')).toContain('re-examine');
        });

        test('RED — the ratchet blocks growth', () => {
            expect(registryGrowthProblems({accepted: 40, baseline: 39}).join(' ')).toContain('the registry GREW');
        });

        test('the ratchet permits SHRINKAGE, which equality would have blocked', () => {
            expect(registryGrowthProblems({accepted: 12, baseline: 39})).toEqual([]);
            expect(registryGrowthProblems({accepted: 39, baseline: 39})).toEqual([]);
        });

        test('the committed baseline matches the committed entry count', () => {
            expect(REGISTRY.$schema.baselineAtIntroduction).toBe(Object.keys(SITES).length);
        });
    });

    test.describe('scanner bounds — stated in the header, asserted here', () => {
        test('comment prose is not a read', () => {
            expect(classifyLine(' * this.db.prepare(sql)', false).isCode).toBe(false);
            expect(classifyLine('// this.db.prepare(sql)', false).isCode).toBe(false);
            expect(classifyLine('const x = this.db;', false).isCode).toBe(true);
        });

        test('a block comment keeps its state across lines', () => {
            const opened = classifyLine('/* opening', false);

            expect(opened.isCode).toBe(false);
            expect(opened.inBlockComment).toBe(true);
            expect(classifyLine('still inside this.db', true).isCode).toBe(false);
            expect(classifyLine('closing */', true).inBlockComment).toBe(false);
        });

        test('methodAt resolves the innermost enclosing method', () => {
            const lines  = linesOf(SESSION_FILE),
                  ranges = findMethodRanges(lines),
                  // SessionService.mjs:383 is the red case's read, 1-based in the report.
                  found  = methodAt(ranges, 382);

            expect(found?.name).toBe('findSessionsToSummarize');
        });
    });
});
