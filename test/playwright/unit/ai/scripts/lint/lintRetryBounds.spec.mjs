import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {
    classifyLine,
    diffRegistry,
    discoverCandidates,
    findEnclosingSymbol,
    findGrowthMatches,
    isRetryContext,
    stripLiterals,
    unresolvedWitnessPaths,
    validateEntry
} from '../../../../../../ai/scripts/lint/lint-retry-bounds.mjs';

const ROOT_DIR = path.resolve(process.cwd()),
      REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'ai/scripts/lint/retry-bound-registry.json'), 'utf8')),
      SITES    = REGISTRY.sites,
      LIVE     = discoverCandidates({rootDir: ROOT_DIR});

/**
 * Looks a site up by `file#symbol`, ignoring the expression fingerprint.
 *
 * Keying on the full registry key would make every assertion churn whenever an unrelated character
 * of the expression changes, which is the opposite of what the fingerprint is for.
 */
function siteStartingWith(prefix) {
    const hit = Object.entries(SITES).find(([key]) => key.startsWith(prefix));

    expect(hit, `no registry entry starts with ${prefix}`).toBeTruthy();

    return hit[1];
}

/**
 * Runs the production discovery seam against one disposable source file.
 *
 * @param {String} source Fixture source.
 * @returns {Object[]} Discovered candidates.
 */
function discoverFixture(source) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-retry-bounds-template-'));

    try {
        ['ai', 'src', 'apps', 'buildScripts'].forEach(dir => fs.ensureDirSync(path.join(rootDir, dir)));
        fs.writeFileSync(path.join(rootDir, 'ai/templateFixture.mjs'), source);

        return discoverCandidates({rootDir})
    } finally {
        fs.removeSync(rootDir)
    }
}

test.describe('lint-retry-bounds — discovery + explicit bound classification (#16443)', () => {
    /**
     * The guard's whole premise: the candidate set comes from a scan, not from a hand-maintained
     * list. A checker carrying its own site list would be re-stating the census that was wrong
     * three times before this ticket existed.
     */
    test('the candidate set is DISCOVERED, and the live tree is fully classified', () => {
        expect(LIVE.length).toBeGreaterThan(10);

        const {unclassified, stale, invalid} = diffRegistry({candidates: LIVE, registry: SITES});

        expect(unclassified).toEqual([]);
        expect(stale).toEqual([]);
        expect(invalid).toEqual([]);
    });

    /**
     * The single most important behavioural property. An unregistered match means "nobody has said
     * what this is", which is true — not "this is a defect", which usually is not, because the
     * non-retry family is larger than the retry family.
     */
    test('an unregistered candidate is UNCLASSIFIED, never asserted unbounded', () => {
        const registryWithoutOne = {...SITES};
        delete registryWithoutOne[LIVE[0].key];

        const {unclassified} = diffRegistry({candidates: LIVE, registry: registryWithoutOne});

        expect(unclassified.map(c => c.key)).toEqual([LIVE[0].key]);
        // The verdict object carries no notion of "unbounded" at all — the vocabulary cannot express it.
        expect(JSON.stringify(unclassified)).not.toContain('unbounded');
    });

    test('a registry entry whose site is gone fails as drift', () => {
        const {stale} = diffRegistry({
            candidates: LIVE,
            registry  : {...SITES, 'ai/does/not/exist.mjs#ghost': {kind: 'not-a-retry', witness: 'n/a'}}
        });

        expect(stale).toEqual(['ai/does/not/exist.mjs#ghost']);
    });

    /**
     * The registry must not degenerate into a suppression allowlist. A witness is what separates
     * "we examined this and here is the proof" from "we agreed to stop asking".
     */
    test('every entry requires a witness, and a retry-growth entry requires lifetime + carrier', () => {
        expect(validateEntry('k', {kind: 'retry-growth', lifetime: 'in-cycle', boundCarrier: 'max-attempts', witness: 'spec'})).toEqual([]);

        expect(validateEntry('k', {kind: 'retry-growth', lifetime: 'in-cycle', boundCarrier: 'max-attempts'}).join(' '))
            .toMatch(/witness is required/);
        expect(validateEntry('k', {kind: 'retry-growth', boundCarrier: 'max-attempts', witness: 'w'}).join(' '))
            .toMatch(/lifetime must be/);
        expect(validateEntry('k', {kind: 'retry-growth', lifetime: 'in-cycle', witness: 'w'}).join(' '))
            .toMatch(/boundCarrier must be/);
        expect(validateEntry('k', {kind: 'nonsense', witness: 'w'}).join(' ')).toMatch(/kind must be/);

        // A non-retry cannot claim a bound carrier: there is no series to bound.
        expect(validateEntry('k', {kind: 'not-a-retry', boundCarrier: 'max-delay', witness: 'w'}).join(' '))
            .toMatch(/must not declare lifetime\/boundCarrier/);
    });

    /**
     * The case that defeats a "returned vs consumed" heuristic — my first proposed rule, which
     * would have produced a false positive on its first run. The growth site returns a raw
     * exponential; the bound is the caller's loop.
     */
    test('message drain classifies in-cycle/max-attempts — the bound is in the CALLER', () => {
        const entry = siteStartingWith('ai/daemons/message/drainCycle.mjs#getMessageDrainBackoffDelayMs');

        expect(entry.kind).toBe('retry-growth');
        expect(entry.lifetime).toBe('in-cycle');
        expect(entry.boundCarrier).toBe('max-attempts');
        expect(entry.witness).toMatch(/caller loop/i);
    });

    /**
     * Proves the schema admits a bound that is NOT a cap on the delay value. The delay genuinely
     * grows here by design; a terminal state stops the series.
     */
    test('freeze reprobe classifies terminal-state — a growing delay that is still bounded', () => {
        const entry = siteStartingWith('ai/services/memory-core/helpers/freezeReprobeDecision.mjs#decideFreezeReprobe');

        expect(entry.boundCarrier).toBe('terminal-state');
        expect(entry.lifetime).toBe('persisted');
    });

    test('all four bound carriers have a real instance — the schema is not aspirational', () => {
        const carriers = new Set(
            Object.values(SITES).filter(e => e.kind === 'retry-growth').map(e => e.boundCarrier)
        );

        expect([...carriers].sort()).toEqual(['max-attempts', 'max-delay', 'max-window', 'terminal-state']);
    });

    /**
     * The control @neo-gpt-emmy asked for, and the one I argued against before conceding.
     *
     * The argument I lost, recorded because the measurement in it was real and only the conclusion
     * was wrong: a full-tree run produces candidates that are overwhelmingly NOT retries — Euclidean
     * distances, easing curves, `1000 ** i` — and I read that as "do not gate them", since a registry
     * row saying "Euclidean distance is not a retry" reads as recording nothing. What the measurement
     * actually supports is only that the rows are low-VALUE, not that they are optional. They are
     * paid once; the hole they leave is permanent, and it sits exactly where the highest-value misses
     * live.
     *
     * A real backoff whose file, symbol AND variable names all avoid retry vocabulary must still be
     * GATED, not merely printed. An earlier revision gated only retry-vocabulary candidates and
     * console.logged the rest, on the reasoning that a canvas physics loop should not have to declare
     * a backoff cap. The reasoning was fine; the mechanism was not — a census on stdout is not a gate,
     * so this exact shape stayed green forever. Vocabulary now orders review and admits nothing.
     */
    test('a neutral-named retry is UNCLASSIFIED, not merely reported — vocabulary annotates, it does not admit', () => {
        const neutral = {
            key         : 'src/time/Clock.mjs#schedule:deadbeef',
            file        : 'src/time/Clock.mjs',
            line        : 12,
            symbol      : 'schedule',
            pattern     : 'exponent',
            retryContext: isRetryContext({file: 'src/time/Clock.mjs', symbol: 'schedule', line: 'const d = base * 2 ** n;'}),
            snippet     : 'const d = base * 2 ** n;'
        };

        // The premise of the control: this site is invisible to the vocabulary. If that ever becomes
        // true-by-vocabulary the control stops testing what it claims, so it is asserted, not assumed.
        expect(neutral.retryContext).toBe(false);

        const {unclassified} = diffRegistry({candidates: [neutral], registry: {}});

        expect(unclassified.map(c => c.key)).toEqual([neutral.key]);
    });

    /**
     * Occurrence multiplicity, including identical text. Two identical growth expressions in one
     * enclosing symbol share a fingerprint by construction, so without an ordinal the second collapses
     * onto the first and `diffRegistry`'s Set reports no drift for a site nobody classified.
     */
    test('two identical expressions in one symbol create TWO obligations', () => {
        const lines = [
            'function schedule() {',
            '    const a = base * 2 ** n;',
            '    const b = base * 2 ** n;',
            '}'
        ];

        expect(findEnclosingSymbol(lines, 1)).toBe('schedule');
        expect(findEnclosingSymbol(lines, 2)).toBe('schedule');

        const first  = {key: 'f.mjs#schedule:abc',    retryContext: true},
              second = {key: 'f.mjs#schedule:abc#1',  retryContext: true};

        // Distinct keys, so registering one leaves the other outstanding.
        const {unclassified} = diffRegistry({
            candidates: [first, second],
            registry  : {'f.mjs#schedule:abc': {kind: 'not-a-retry', witness: 'w'}}
        });

        expect(unclassified.map(c => c.key)).toEqual([second.key]);
    });

    /**
     * Multiple matches on ONE source line. `PATTERNS.find` answered "does this line contain a growth
     * expression"; a Euclidean distance contains two, and the second was absorbed with nothing
     * recording that a site had been merged away.
     */
    test('a line holding two growth expressions yields two matches, de-duplicated by position', () => {
        expect(findGrowthMatches('dist = (nx - x) ** 2 + (ny - y) ** 2;')).toHaveLength(2);
        expect(findGrowthMatches('const d = base * 2 ** n;')).toHaveLength(1);
        expect(findGrowthMatches('const plain = a + b;')).toHaveLength(0);

        // Overlapping patterns describing one token must not double-count it.
        const overlapping = findGrowthMatches('Math.pow(a, 2)');

        expect(overlapping).toHaveLength(1);
        expect(overlapping[0].id).toBe('pow');

        // Source order, so the registry ordinal is stable rather than pattern-declaration dependent.
        expect(findGrowthMatches('x = (a) ** 2 + Math.pow(b, 2);').map(m => m.id)).toEqual(['exponent', 'pow']);
    });

    test('vocabulary still separates the plausible retries from the geometry, for review ordering', () => {
        // Same scan roots, opposite verdicts — so the exclusion cannot be a path rule.
        expect(isRetryContext({file: 'src/main/DomEvents.mjs',        line: 'return Math.sqrt((x2 - x1) ** 2)', symbol: 'getDistance'})).toBe(false);
        expect(isRetryContext({file: 'src/canvas/Sparkline.mjs',      line: 'progress = 1 - Math.pow(1 - progress, 3);', symbol: 'renderLoop'})).toBe(false);
        expect(isRetryContext({file: 'src/form/field/FileUpload.mjs', line: 'bytes / (1000 ** i)', symbol: 'formatSize'})).toBe(false);

        expect(isRetryContext({file: 'src/data/connection/WebSocket.mjs', line: 'backoffStrategy: attempt => Math.min(1000 * Math.pow(2, attempt - 1), 30000),', symbol: '<module>'})).toBe(true);
        expect(isRetryContext({file: 'src/manager/DragCoordinator.mjs', line: 'Math.min(5000, 100 * 2 ** Math.min(dispositionAttempts - 1, 4))', symbol: 'settleNativeWindowDisposition'})).toBe(true);
    });

    /**
     * The regression guard for the bug this discriminator introduced and nearly shipped: the first
     * draft used `\b`-delimited words, and `\bconsecutive\b` does not match `consecutiveFailures`
     * because a word character follows. That silently dropped `tenantRepoSync#isRepoDue` — the site
     * whose unbounded backoff once starved a tenant sync lane for over a day. camelCase is the
     * dominant identifier style here, so word-boundary anchoring fails precisely on the
     * highest-value sites, and it fails by omission rather than by error.
     */
    test('camelCase identifiers are matched — the sites that motivated the gate stay discovered', () => {
        expect(isRetryContext({file: 'ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs', line: 'const backoffMultiplier = Math.pow(2, Math.max(0, consecutiveFailures));', symbol: 'isRepoDue'})).toBe(true);
        expect(isRetryContext({file: 'src/manager/DragCoordinator.mjs', line: '2 ** Math.min(candidate.dispositionAttempts - 1, 4)', symbol: 'settleNativeWindowDisposition'})).toBe(true);

        const discovered = LIVE.map(c => c.file);

        ['tenantRepoSync.mjs', 'boundedRetryGate.mjs', 'ai/agent/Loop.mjs', 'DragCoordinator.mjs']
            .forEach(marker => expect(discovered.some(f => f.includes(marker)), `${marker} must stay discovered`).toBe(true));
    });

    /**
     * A witness naming a spec deleted two refactors ago reads exactly like one naming a live spec,
     * so presence was never evidence. Resolution is deliberately limited to PATHS — symbols and
     * clamps still rest on review, and claiming otherwise would be its own unwitnessed assertion.
     */
    test('a witness naming a path that does not exist is not evidence', () => {
        expect(unresolvedWitnessPaths('k', 'guard at ai/agent/Loop.mjs')).toEqual([]);
        expect(unresolvedWitnessPaths('k', '`Math.min(a, b)` clamp in the same expression')).toEqual([]);

        expect(unresolvedWitnessPaths('k', 'proven by test/playwright/unit/ai/deleted/gone.spec.mjs').join(' '))
            .toMatch(/does not exist/);

        // And it is wired into entry validation, not merely available.
        expect(validateEntry('k', {
            kind: 'not-a-retry', witness: 'see ai/services/vanished/Nope.mjs'
        }).join(' ')).toMatch(/does not exist/);
    });

    test('the witness contract is source-keyed — inline rationale or a resolvable path', () => {
        expect(REGISTRY.$schema.witness).toMatch(/Source-keyed contract/);

        expect(validateEntry('ai/example.mjs#schedule:deadbeef', {
            kind   : 'not-a-retry',
            witness: 'The exponent is byte-unit conversion evaluated once; no retry loop exists.'
        })).toEqual([]);

        expect(validateEntry('ai/example.mjs#schedule:deadbeef', {
            kind   : 'not-a-retry',
            witness: 'Guarded by ai/agent/Loop.mjs#processEvent'
        })).toEqual([])
    });

    test('every live witness resolves', () => {
        Object.entries(SITES).forEach(([key, entry]) => {
            expect(unresolvedWitnessPaths(key, entry.witness)).toEqual([]);
        });
    });

    test('literal contents cannot match — markdown bold is not an exponent', () => {
        expect(stripLiterals('const a = `**bold** text`;').code).not.toMatch(/\*\*b/);
        expect(stripLiterals('const x = base ** attempt;').code).toMatch(/\*\*/);

        // Multi-line template state carries, so a prose continuation line is not scanned as code.
        expect(stripLiterals('const s = `line one', false).inTemplate).toBe(true);
        expect(stripLiterals('  2. **Feature Namespace:** prose', true).code.trim()).toBe('');
    });

    test('a growth expression in a continuation-line template substitution IS discovered', () => {
        const candidates = discoverFixture([
            'export function schedule(base, attempt) {',
            '    return `status:',
            '        ${base * 2 ** attempt}',
            '    `',
            '}'
        ].join('\n'));

        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            file   : 'ai/templateFixture.mjs',
            line   : 3,
            pattern: 'exponent',
            symbol : 'schedule'
        })
    });

    test('nested templates do not leak later markdown bold into discovery', () => {
        const candidates = discoverFixture([
            'export function render(items, issueId, changes) {',
            '    const prompt = `header',
            '        ${items.map(item => `',
            '            ${item}',
            '        `).join("\\n")}',
            '    `;',
            '    return `Closes #${issueId}\\n\\n**AI Generated PR**\\n${changes.map(change => `- ${change}`).join("\\n")}`',
            '}'
        ].join('\n'));

        expect(candidates).toEqual([])
    });

    test('comment lines are excluded by shape, including block continuations', () => {
        expect(classifyLine('  const a = 2 ** b;', false).isCode).toBe(true);
        expect(classifyLine('  // 2 ** b', false).isCode).toBe(false);
        expect(classifyLine('   * a table describing Math.pow bounding', false).isCode).toBe(false);
        expect(classifyLine('/* opens', false).inBlockComment).toBe(true);
        expect(classifyLine(' still inside 2 ** b', true).isCode).toBe(false);
    });

    test('sites key on the enclosing symbol, so unrelated edits above do not re-baseline', () => {
        const lines = [
            'function outer() {',
            '    if (x) {',
            '        return 2 ** n;',
            '    }',
            '}'
        ];

        // `if` must not become the key — control flow matches the method-signature shape.
        expect(findEnclosingSymbol(lines, 2)).toBe('outer');
        expect(findEnclosingSymbol(['const a = 1;'], 0)).toBe('<module>');
    });
});
