import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import {
    classifyLine,
    diffRegistry,
    discoverCandidates,
    findEnclosingSymbol,
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
     * Supersedes an earlier test asserting the non-retry family is recorded rather than filtered.
     * That design collapsed on measurement: a full-tree run produced 62 candidates of which 34 sat
     * outside `ai/` and only 3 of those were retries — the rest were `(x2 - x1) ** 2`,
     * `Math.pow(1 - progress, 3)` and `1000 ** i`. Asking a canvas physics loop to declare its
     * backoff cap makes a gate developers route around, and 14 registry rows saying "Euclidean
     * distance is not a retry" record nothing worth reading.
     *
     * The exclusion is SEMANTIC, not a path filter — which is what the superseded test was really
     * protecting against, and that property is asserted directly below.
     */
    test('the discriminator excludes non-retries by vocabulary, never by path', () => {
        // Same scan roots, opposite verdicts — so the exclusion cannot be a path rule.
        expect(isRetryContext({file: 'src/main/DomEvents.mjs',        line: 'return Math.sqrt((x2 - x1) ** 2)', symbol: 'getDistance'})).toBe(false);
        expect(isRetryContext({file: 'src/canvas/Sparkline.mjs',      line: 'progress = 1 - Math.pow(1 - progress, 3);', symbol: 'renderLoop'})).toBe(false);
        expect(isRetryContext({file: 'src/form/field/FileUpload.mjs', line: 'bytes / (1000 ** i)', symbol: 'formatSize'})).toBe(false);

        expect(isRetryContext({file: 'src/data/connection/WebSocket.mjs', line: 'backoffStrategy: attempt => Math.min(1000 * Math.pow(2, attempt - 1), 30000),', symbol: '<module>'})).toBe(true);
        expect(isRetryContext({file: 'apps/devindex/services/GitHub.mjs', line: 'this.restRetryBaseDelayMs * 2 ** (attempt - 1)', symbol: '#getRetryDelay'})).toBe(true);
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
