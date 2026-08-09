import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import {
    deferredMembersOf,
    diffRegistry,
    discoverViolations,
    escapeRegExp,
    findMethodRanges,
    isGuardTestLine,
    methodAt,
    receiverAliases,
    registryGrowthProblems,
    stripSource,
    typedGuardMembers,
    unresolvedWitnessPaths,
    validateEntry,
    violationsInSource
} from '../../../../../../ai/scripts/lint/lint-deferred-member-readiness.mjs';

/**
 * Runs the scanner over synthetic source with a standard deferred member.
 *
 * @summary Every falsifier below is a whole-file probe rather than a unit call on one helper,
 * because the defects @neo-gpt-emmy found lived in the INTERACTION — a method range that closed
 * early made reads vanish without any single helper being wrong.
 * @param {String} body Class body after `initAsync`.
 * @returns {Object[]}
 */
function probe(body) {
    return violationsInSource('probe.mjs', [
        'class Probe {',
        '    async initAsync() {',
        '        this.db = await build();',
        '    }',
        ...body.split('\n'),
        '}'
    ])
}

const
    ROOT_DIR = path.resolve(process.cwd()),
    REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'ai/scripts/lint/deferred-member-registry.json'), 'utf8')),
    SITES    = REGISTRY.sites,
    LIVE     = discoverViolations({rootDir: ROOT_DIR}),

    RED_CASE     = 'ai/services/memory-core/SessionService.mjs#findSessionsToSummarize:memoryCollection',
    SESSION_FILE = path.join(ROOT_DIR, 'ai/services/memory-core/SessionService.mjs'),
    GRAPH_FILE   = path.join(ROOT_DIR, 'ai/services/memory-core/GraphService.mjs');

/**
 * Literal-stripped lines for a file, as the scanner itself sees them.
 *
 * @summary Deliberately stripped, not raw. Several assertions below passed against RAW lines, on a
 * code path production never takes — a stripSource regression would not have moved them. A test that
 * exercises a different contract than the caller is a test that passes by accident.
 * @param {String} file Absolute path.
 * @returns {String[]}
 */
function linesOf(file) {
    return stripSource(fs.readFileSync(file, 'utf8').split('\n'))
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

        const synthetic = stripSource([
            'class Probe {',
            '    async initAsync() {',
            '        this.store = await build();',
            '    }',
            '    async query({now = Date.now(), limit = cap()} = {}) {',
            '        return this.store.get(now, limit);',
            '    }',
            '}'
        ]);

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
              lines  = stripSource(source.split('\n')),
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
        const notDeferred = stripSource([
            'class Probe {',
            '    construct(config) {',
            '        this.memoryCollection = buildSync();',
            '    }',
            '    async initAsync() {',
            '        await super.initAsync();',
            '    }',
            '}'
        ]);

        expect([...deferredMembersOf(notDeferred, findMethodRanges(notDeferred))]).toEqual([]);
    });

    test('an assignment is distinguished from a comparison and an arrow', () => {
        const lines = stripSource([
            'class Probe {',
            '    async initAsync() {',
            '        this.real = await build();',
            '        this.compared === other;',
            '        this.arrow => never;',
            '    }',
            '}'
        ]);

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
            // An earlier revision anchored on `if (this.x)` and read this as an unguarded crash risk
            // — a guarded site reported as a defect. A guard is a guard wherever it sits.
            expect(probe([
                '    read() {',
                '        if (!config.enabled || !this.db) return null;',
                '        return this.db.prepare(sql);',
                '    }'
            ].join('\n'))[0].shape).toBe('truthy-skip');
        });

        test('a `this.x && …` guard needs no `if` to count', () => {
            expect(probe([
                '    close() {',
                '        this.db && this.db.close();',
                '    }'
            ].join('\n'))[0].shape).toBe('truthy-skip');
        });

        test('an unguarded read is bare-read', () => {
            expect(probe([
                '    read() {',
                '        const row = this.db.prepare(sql).get();',
                '        return row;',
                '    }'
            ].join('\n'))[0].shape).toBe('bare-read');
        });

        test('an optional chain is its own shape', () => {
            expect(probe([
                '    start() {',
                '        return this.db?.start();',
                '    }'
            ].join('\n'))[0].shape).toBe('optional-chain');
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

        test('RED — a missing or malformed baseline is an ERROR, not a silent pass', () => {
            // An earlier revision skipped the ratchet when the value was absent, so deleting one line
            // from the registry disabled the growth gate with nothing red anywhere. A carve-out that
            // quiets a guard opens a channel nobody is watching.
            for (const baseline of [undefined, null, '72', 39.5]) {
                expect(
                    registryGrowthProblems({accepted: 72, baseline}).join(' '),
                    `baseline ${JSON.stringify(baseline)} must not disable the ratchet`
                ).toContain('no valid integer')
            }
        });

        test('the ratchet permits SHRINKAGE, which equality would have blocked', () => {
            expect(registryGrowthProblems({accepted: 12, baseline: 39})).toEqual([]);
            expect(registryGrowthProblems({accepted: 39, baseline: 39})).toEqual([]);
        });

        test('the committed baseline matches the committed entry count', () => {
            expect(REGISTRY.$schema.baselineAtIntroduction).toBe(Object.keys(SITES).length);
        });
    });

    /**
     * Cross-family review supplied these as synthetic falsifiers, and every one produced the wrong
     * verdict against the first implementation. They are pinned because each is a way for the gate to
     * be GREEN when it should be red — the failure direction that matters in a guard, and the one an
     * author's own tests are least likely to probe.
     */
    test.describe('reviewer falsifiers — the gate must not be green here', () => {
        test('RED — an unrelated throw must not manufacture a typed guard', () => {
            const found = probe([
                '    read() {',
                '        if (!this.db) return null;',
                '        const r = this.db.q();',
                '        if (r.bad) throw new Error("unrelated");',
                '        return r;',
                '    }'
            ].join('\n'));

            expect(found).toHaveLength(1);
            expect(found[0].shape).toBe('truthy-skip');
        });

        test('GREEN — a CAUSAL guard, throwing on the absence path, does credit', () => {
            expect(probe([
                '    requireDb() {',
                '        if (!this.db) {',
                '            throw new Error("unavailable");',
                '        }',
                '        return this.db;',
                '    }',
                '    read() {',
                '        return this.db.q();',
                '    }'
            ].join('\n'))).toEqual([]);
        });

        test('RED — a commented-out await does not credit readiness', () => {
            const found = probe([
                '    read() {',
                '        // await this.ready()',
                '        return this.db.q();',
                '    }'
            ].join('\n'));

            expect(found).toHaveLength(1);
            expect(found[0].shape).toBe('bare-read');
        });

        test('RED — a brace inside a string literal does not close the method', () => {
            expect(probe([
                '    read() {',
                '        const brace = "}";',
                '        return this.db.q();',
                '    }'
            ].join('\n'))).toHaveLength(1);
        });

        test('RED — a later guard does not excuse an earlier bare read', () => {
            const found = probe([
                '    read() {',
                '        const first = this.db.q();',
                '        if (this.db) { return this.db.q2(); }',
                '    }'
            ].join('\n'));

            expect(found).toHaveLength(1);
            expect(found[0].shape).toBe('bare-read');
        });

        test('RED — a read through a `const me = this` alias is seen', () => {
            const found = probe([
                '    read() {',
                '        const me = this;',
                '        return me.db.q();',
                '    }'
            ].join('\n'));

            expect(found).toHaveLength(1);
            expect(found[0].member).toBe('db');
        });

        test('GREEN — readiness awaited through the alias credits', () => {
            expect(probe([
                '    async read() {',
                '        const me = this;',
                '        await me.ready();',
                '        return me.db.q();',
                '    }'
            ].join('\n'))).toEqual([]);
        });

        test('a multiline method declaration is found, body and all', () => {
            const lines = [
                'class Probe {',
                '    async initAsync() {',
                '        this.db = await build();',
                '    }',
                '    query({',
                '        limit = 100,',
                '        since = 0',
                '    } = {}) {',
                '        return this.db.q(limit, since);',
                '    }',
                '}'
            ];

            expect(findMethodRanges(stripSource(lines)).map(r => r.name)).toContain('query');
            expect(violationsInSource('probe.mjs', lines).map(v => v.method)).toEqual(['query']);
        });

        /**
         * Not from the review — found while writing the probes above. A single-line body made the
         * whole FILE silent, and the probes looked like they were passing.
         */
        test('a single-line method body does not silence the file', () => {
            const found = violationsInSource('probe.mjs', [
                'class Probe {',
                '    async initAsync() { this.db = await build(); }',
                '    read() {',
                '        return this.db.q();',
                '    }',
                '}'
            ]);

            expect(found).toHaveLength(1);
            expect(found[0].member).toBe('db');
        });

        test('the three named production misses are now in the population', () => {
            const keys = LIVE.map(v => v.key);

            expect(keys).toContain('ai/services/knowledge-base/KBRecorderService.mjs#buildAgentFaqs:db');
            expect(keys).toContain('ai/services/knowledge-base/KBRecorderService.mjs#listAgentFaqs:db');
            expect(keys).toContain('ai/services/memory-core/MemoryCoreRecorderService.mjs#getMemoryCoreToolMetrics:db');
        });

        test('the named alias miss is in the population, and its safe sibling is not', () => {
            const keys = LIVE.map(v => v.key);

            expect(keys).toContain('src/functional/component/Base.mjs#onEffectRunStateChange:htmlTemplateProcessor');

            // Mermaid.render() awaits me.ready() before reading me.addon — the positive control for
            // alias-aware readiness. Only loadFiles(), which does not, is reported.
            expect(LIVE.filter(v => v.file.endsWith('Mermaid.mjs')).map(v => v.method)).toEqual(['loadFiles']);
        });

        test('no read is attributed to <module> — a scanner gap must not become silent under-reporting', () => {
            expect(LIVE.filter(v => v.method === '<module>')).toEqual([]);
        });
    });

    test.describe('scanner bounds — stated in the header, asserted here', () => {
        test('comment and literal text is blanked before any structural question', () => {
            const stripped = stripSource([
                'const a = "this.db";',
                '// this.db.prepare(sql)',
                'const b = this.db;'
            ]);

            expect(stripped[0]).not.toContain('this.db');
            expect(stripped[1].trim()).toBe('');
            expect(stripped[2]).toContain('this.db');
        });

        test('a template substitution survives stripping, its surrounding text does not', () => {
            const [stripped] = stripSource(['const s = `prose this.db ${this.db} more`;']);

            expect(stripped.match(/this\.db/g)).toHaveLength(1);
        });

        /**
         * Every identifier read out of source is interpolated into `new RegExp(...)`. An earlier
         * revision escaped only `$` — reasoned sufficient because the capture patterns admit only
         * identifier characters — and CodeQL flagged the incomplete sanitization. The reasoning was
         * the defect: an invariant enforced in a different function is one loosened pattern away
         * from being false.
         */
        test('a literal embedded in a pattern is fully escaped, backslash included', () => {
            expect(escapeRegExp('db')).toBe('db');
            expect(escapeRegExp('my$Member')).toBe('my\\$Member');
            expect(escapeRegExp('a\\b')).toBe('a\\\\b');
            expect(escapeRegExp('x.y')).toBe('x\\.y');
            expect(escapeRegExp('a|b')).toBe('a\\|b');

            // The property that matters: whatever goes in matches itself and nothing else.
            for (const literal of ['a.b', 'a|b', 'a\\b', 'a(b', 'a[b', 'a$b']) {
                expect(new RegExp(`^${escapeRegExp(literal)}$`).test(literal), literal).toBe(true)
            }
        });

        test('receiver aliases are collected, and `this` is always one', () => {
            const lines    = ['fn() {', '    const me = this;', '    return me.x;', '}'],
                  stripped = stripSource(lines);

            expect(receiverAliases(stripped, {start: 0, end: 3}).sort()).toEqual(['me', 'this']);
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
