import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import {
    classifyLine,
    diffRegistry,
    discoverCandidates,
    findEnclosingSymbol,
    stripLiterals,
    validateEntry
} from '../../../../../../ai/scripts/lint/lint-retry-bounds.mjs';

const ROOT_DIR = path.resolve(process.cwd()),
      REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'ai/scripts/lint/retry-bound-registry.json'), 'utf8')),
      SITES    = REGISTRY.sites,
      LIVE     = discoverCandidates({rootDir: ROOT_DIR});

test.describe('lint-retry-bounds — discovery + explicit bound classification (#16443)', () => {
    /**
     * The guard's whole premise: the candidate set comes from a scan, not from a hand-maintained
     * list. A checker carrying its own site list would be re-stating the census that was wrong
     * three times before this ticket existed.
     */
    test('the candidate set is DISCOVERED, and the live tree is fully classified', () => {
        expect(LIVE.length).toBeGreaterThan(20);

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
        const entry = SITES['ai/daemons/message/drainCycle.mjs#getMessageDrainBackoffDelayMs'];

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
        const entry = SITES['ai/services/memory-core/helpers/freezeReprobeDecision.mjs#decideFreezeReprobe'];

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
     * The false-positive family is RECORDED, not filtered. A path/filename exclusion would hide the
     * examined set behind a regex nobody audits — and would silently swallow a future retry site
     * that happened to live in an excluded path.
     */
    test('non-retry matches are classified with witnesses, not path-filtered away', () => {
        const notRetries = Object.entries(SITES).filter(([, e]) => e.kind === 'not-a-retry');

        expect(notRetries.length).toBeGreaterThan(5);
        notRetries.forEach(([key, entry]) => {
            expect(entry.witness, `${key} needs a witness`).toBeTruthy();
            expect(entry.lifetime).toBeUndefined();
            expect(entry.boundCarrier).toBeUndefined();
        });

        // Canvas easing lives under apps/ and src/ — both inside the scan roots, proving the family
        // is reached and classified rather than excluded by path.
        expect(notRetries.some(([key]) => key.startsWith('src/'))).toBe(true);
        expect(notRetries.some(([key]) => key.startsWith('apps/'))).toBe(true);
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
