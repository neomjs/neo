import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {
    DEFAULT_BOUNDS,
    dropQuotedSpans,
    formatDensityWarning,
    isConfession,
    isInScopePath,
    isProseLine,
    isTagLine,
    measureProseDensity,
    measureRange,
    pendingRanges,
    summarizeDensity
} from '../../../../buildScripts/util/check-comment-density.mjs';

/**
 * Two axes, warned on independently. The share axis has an author-controlled denominator — fixture
 * lines in the same commit dilute a long docblock below the bar — so the run axis exists to catch what
 * the share cannot see.
 */
test.describe('check-comment-density — the axes measured on real commits', () => {
    /**
     * The red-proof runs the TOOL over named commits rather than asserting hand-written numbers.
     *
     * An earlier version of this file fed `longestRun: 36` in as a fixture, which passed while the
     * tool computed 9 on the same commit — the bar logic was proven and the measurement was not. The
     * defect that hid behind it: the run broke on tag lines, so a 45-line docblock scored 9 and the
     * axis fired on 0 of 92 recent commits.
     */
    const commit = range => summarizeDensity(measureRange(range, execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf-8'}).trim()));

    test('RED-PROOF, run axis: the tool warns where the share axis provably cannot', () => {
        // a17ade4264 — the head the operator change-requested for a 45-line docblock.
        const summary = commit('a17ade4264~1..a17ade4264');

        expect(summary.longestRun, 'the docblock the operator flagged').toBe(45);
        expect(summary.shareExceeded, '19% share is comfortably under the bar').toBe(false);
        expect(summary.runExceeded).toBe(true);
        expect(summary.warn).toBe(true);
    });

    test('SILENT ARM: a commit at the repo median warns on neither axis', () => {
        const summary = commit('087114e8ab~1..087114e8ab');

        expect(summary.longestRun).toBe(11);
        expect(summary.shareExceeded).toBe(false);
        expect(summary.runExceeded).toBe(false);
        expect(summary.warn, 'without this, a guard that warns on everything passes the arm above').toBe(false);
    });

    test('the share axis catches what the run axis misses — the two are independent', () => {
        // 027125dcf7, the change-request FIX: the run collapses 45 -> 5, and 27 of its 32 added lines
        // are comment, so the share axis is what still has something to say.
        const summary = commit('027125dcf7~1..027125dcf7');

        expect(summary.longestRun).toBe(5);
        expect(summary.runExceeded).toBe(false);
        expect(summary.shareExceeded).toBe(true);
    });

    const measured = {
        // 62% share, the worst share observed in the sampled window.
        highShare: {file: 'a.mjs', added: 343, prose: 214, longestRun: 20},
        // 21% share with a 36-line run: under the share bar, operator change-requested for bloat.
        dilutedRun: {file: 'b.mjs', added: 316, prose: 69, longestRun: 36},
        // 20% share, 11-line run — at the repo median on both axes.
        clean: {file: 'c.mjs', added: 105, prose: 21, longestRun: 11}
    };

    test('the share axis warns high and stays silent at the median', () => {
        expect(summarizeDensity([measured.highShare]).shareExceeded).toBe(true);
        expect(summarizeDensity([measured.clean]).shareExceeded).toBe(false);
    });

    test('RED-PROOF: the run axis warns where the share axis provably cannot', () => {
        const summary = summarizeDensity([measured.dilutedRun]);

        expect(summary.shareExceeded, 'a 21% share is under the bar').toBe(false);
        expect(summary.runExceeded, 'a 36-line run must still warn').toBe(true);
        expect(summary.warn).toBe(true);
        expect(summary.worstFile).toBe('b.mjs');
    });

    test('SILENT ARM for the run axis, so a guard that warns on everything fails here', () => {
        const summary = summarizeDensity([measured.clean]);

        expect(summary.runExceeded).toBe(false);
        expect(summary.warn).toBe(false);
    });

    test('both bars are the p90 of the seats whose behaviour did NOT change', () => {
        // Measured per commit on origin/dev, ≥ 20 added in-scope lines. Two independent flat controls
        // land on the same numbers: block-run p90 34 (Opus 4.8, n=552) and 35 (Fable, n=162); share
        // p90 31.9% and 28.5%. A trailing median would drift up with the behaviour it measures; a
        // pre-regression distribution does not move. An earlier bar cited a whole-FILE distribution,
        // which is a different substrate from the per-commit added lines the tool actually measures.
        expect(DEFAULT_BOUNDS.maxProseRun).toBe(35);
        expect(DEFAULT_BOUNDS.maxProseShare).toBeCloseTo(0.3);
    });

    test('a changed bound changes the outcome — the bars are inputs, not baked-in numbers', () => {
        expect(summarizeDensity([measured.dilutedRun], {maxProseRun: 100}).runExceeded).toBe(false);
        expect(summarizeDensity([measured.clean], {maxProseShare: 0.05}).shareExceeded).toBe(true);
    });

    test('partial bounds normalize onto the defaults rather than disabling an axis', () => {
        expect(summarizeDensity([measured.dilutedRun], {maxProseShare: 0.9}).runExceeded).toBe(true);
    });

    test('the run is a per-file maximum, never summed across files', () => {
        const summary = summarizeDensity([
            {file: 'x.mjs', added: 50, prose: 5, longestRun: 20},
            {file: 'y.mjs', added: 50, prose: 5, longestRun: 25}
        ]);

        expect(summary.longestRun).toBe(25);
        expect(summary.runExceeded).toBe(false);
    });

    test('an empty staged set never warns', () => {
        const summary = summarizeDensity([]);

        expect(summary).toMatchObject({added: 0, prose: 0, share: 0, longestRun: 0, warn: false});
    });
});

test.describe('check-comment-density — prose classification', () => {
    const added = lines => measureProseDensity(lines, new Set(lines.map((_, i) => i + 1)));

    test('a JSDoc tag line is contract, not prose', () => {
        expect(isTagLine(' * @param {String} x')).toBe(true);
        expect(isTagLine(' * @returns {Boolean}')).toBe(true);
        expect(isTagLine(' * an explanation')).toBe(false);

        // A tag is excluded from PROSE but does not break the RUN: the two axes measure different
        // objects, and a 45-line docblock is 45 lines to a reader whether or not `@param` sits in it.
        const block = added(['/**', ' * prose', ' * @param {String} x', ' * prose', ' */']);

        expect(block.longestRun, 'the whole block, delimiters included').toBe(5);
        expect(block.prose, 'two prose lines; the tag and both delimiters are not prose').toBe(2);
        expect(isProseLine('*'), 'a `/**` opener extracts as `*` and is a delimiter, not prose').toBe(false);
        expect(isProseLine(' one'), 'a comment with a word is prose').toBe(true);
    });

    test('a comment marker inside a string literal is not prose', () => {
        expect(added(['const s = "// not a comment";']).prose).toBe(0);
        expect(added(['const u = "https://example.com";']).prose).toBe(0);
    });

    test('a block comment is ONE run across its full extent, and code ends it', () => {
        // The delimiters carry no text, so they are not prose — but they are part of the block a
        // reader faces, so the run counts them. `code();` is not a comment and closes the run.
        const block = added(['/*', ' * one', ' * two', ' * three', ' */', 'code();']);

        expect(block.longestRun).toBe(5);
        expect(block.prose, 'three text lines; the two delimiters are not prose').toBe(3);
        expect(added([' * orphan prose outside a block']).prose, 'not a comment without an opener').toBe(0);
    });

    test('an UNCHANGED line breaks the run — prose split by untouched code is not one block', () => {
        const lines  = ['// one', '// two', 'const untouched = 1;', '// three', '// four'];
        const result = measureProseDensity(lines, new Set([1, 2, 4, 5]));

        expect(result.added).toBe(4);
        expect(result.prose).toBe(4);
        expect(result.longestRun, 'the unchanged line must split the two pairs').toBe(2);
    });

    test('pre-existing prose is not counted as this commit\'s', () => {
        const lines  = ['// old', '// old', '// new'];
        const result = measureProseDensity(lines, new Set([3]));

        expect(result.added).toBe(1);
        expect(result.prose).toBe(1);
        expect(result.longestRun).toBe(1);
    });
});

test.describe('check-comment-density — deferral detection', () => {
    test('the founding specimen fires: a reasoned, unticketed deferral is still a deferral', () => {
        // The census specimen. `deliberately` asserts intent without discharging the obligation, so it
        // is not in DECIDED_MARKERS — exempting it would exempt the best-dressed confessions.
        expect(isConfession('worthwhile and deliberately left alone')).toBe(true);
        expect(isConfession('Pass generic env for now')).toBe(true);
        expect(isConfession('Ideally we hydrate the source store here')).toBe(true);
    });

    test('a marker is its own admission — no stance word converts it into a decision', () => {
        expect(isConfession('TODO: Implement geocoding')).toBe(true);
        expect(isConfession('FIXME intentionally')).toBe(true);
        expect(isConfession('HACK(perf): re-reads the tree')).toBe(true);
    });

    test('MARKER form only — the English word is prose about obligations, not an obligation', () => {
        // Bare `todo` matched 90 repo lines, mostly prose; the marker form matched 14, all real.
        expect(isConfession("an announcement becomes someone else's todo")).toBe(false);
        expect(isConfession('TODO: cache all regex')).toBe(true);
    });

    test('REFUTED VOCABULARY: this repo\'s domain nouns are not deferrals', () => {
        // These four carried 326 of 458 hits in a first draft and were measured out, not guessed out.
        expect(isConfession('a CPU deployment burned ~2.3 cores at `0 updated, 30 deferred` per pass')).toBe(false);
        expect(isConfession('Webhook delivery is recognized in config but not yet POSTed.')).toBe(false);
        expect(isConfession('the follow-up wires mutating ops — the dispatch core fails CLOSED')).toBe(false);
        expect(isConfession("Placeholder values ('unknown', 'n/a', 'tbd') THROW")).toBe(false);
    });

    test('REFUTED VOCABULARY: concession shapes scored 0 true across 13 candidate hits', () => {
        // The operator's specimen ("duplicating code is bad, but…") is a real behaviour that this
        // repo does not write in words a regex can separate from precise technical prose. Both
        // candidate shapes were measured repo-wide: lexical `i know…` was 0 true / 8 false, and
        // structural `<norm>…but` was 0 true / 5 false. Neither ships; these arms pin the negative
        // so a future author re-adding one has to beat a recorded measurement, not an opinion.
        expect(isConfession('answering "admissible" would certify precisely the case we know')).toBe(false);
        expect(isConfession('scrolls we caused, because we know we caused them')).toBe(false);
        expect(isConfession('declared `number`, which accepts values that are not wrong-ish but INVALID')).toBe(false);
        expect(isConfession('rejects bad rows at the upsert boundary, but a replace-mode import truncates')).toBe(false);
    });

    test('USE vs MENTION: quoting a marker as an example is not owing work', () => {
        // Any file documenting this vocabulary quotes the markers, this one included. Measured on the
        // repo: the rule drops 3 of 49 hits and all 3 are mentions, so it costs no recall.
        expect(isConfession('"Pass generic env for now" is the specimen')).toBe(false);
        expect(isConfession('the marker form matched ("TODO: Implement geocoding")')).toBe(false);
        expect(isConfession('`// TODO: remove when it lands` is observed by nobody')).toBe(false);
        expect(isConfession('**for now** is the marker this names')).toBe(false);

        // The same words UNQUOTED still fire — the rule reads quoting, not vocabulary.
        expect(isConfession('Pass generic env for now')).toBe(true);
        expect(isConfession('TODO: Implement geocoding')).toBe(true);
    });

    test('an unbalanced quote is treated as a span that OPENS here, not as unquoted text', () => {
        expect(isConfession('unbalanced mention opens here ("for now')).toBe(false);
        // An EVEN count pairs correctly, so the mention is dropped.
        expect(dropQuotedSpans('a "b" c "TODO: x").').includes('TODO')).toBe(false);

        // Stated limit, not a silent one, and this was a real line in this file: with THREE quotes the
        // balanced pass consumes the first two, leaving the third dangling and the mention exposed.
        // Deciding it needs cross-line quote state, which check-ticket-archaeology declines too.
        expect(dropQuotedSpans('todo"); the form matched ("TODO: x").').includes('TODO')).toBe(true);
    });

    test('a bound obligation is not a confession, and the marker is the reachable escape', () => {
        expect(isConfession('left alone for now — ticket-ref-ok: covered by the parent sweep')).toBe(false);
        expect(isConfession('skipped by design for now')).toBe(false);
        // Unequal reach, deliberately: check-ticket-archaeology rejects a bare ref on a NEW comment
        // line under ai/ src/ test/, so this arm is independently live only under buildScripts/.
        expect(isConfession('revisit once #17400 lands')).toBe(false);
    });

    test('confessions ride along with the density measurement, carrying line numbers', () => {
        const lines  = ['// for now, assume one tenant', 'const x = 1;', '// TODO: widen'],
              result = measureProseDensity(lines, new Set([1, 2, 3]));

        expect(result.confessions).toHaveLength(2);
        expect(result.confessions.map(entry => entry.line)).toEqual([1, 3]);
    });

    test('a PRE-EXISTING confession is not this commit\'s — only added lines are reported', () => {
        const result = measureProseDensity(['// TODO: old debt', '// for now, mine'], new Set([2]));

        expect(result.confessions).toHaveLength(1);
        expect(result.confessions[0].line).toBe(2);
    });
});

test.describe('check-comment-density — pre-push consumer', () => {
    const ZERO = '0'.repeat(40),
          sha  = char => char.repeat(40);

    test('the pushed range is remoteSha..localSha, the boundary git itself applies', () => {
        expect(pendingRanges(`refs/heads/x ${sha('a')} refs/heads/x ${sha('b')}`)).toEqual([`${sha('b')}..${sha('a')}`]);
    });

    test('a NEW remote branch has no boundary sha, so the range falls back to the trunk', () => {
        expect(pendingRanges(`refs/heads/x ${sha('a')} refs/heads/x ${ZERO}`)).toEqual([`origin/dev..${sha('a')}`]);
    });

    test('a branch DELETION pushes no commits and measures nothing', () => {
        expect(pendingRanges(`refs/heads/x ${ZERO} refs/heads/x ${sha('b')}`)).toEqual([]);
    });

    test('empty stdin is a manual run — it measures the branch rather than no-opping', () => {
        // A check that silently passes when it cannot see its input is not a check.
        expect(pendingRanges('')).toEqual(['origin/dev..HEAD']);
        expect(pendingRanges(undefined)).toEqual(['origin/dev..HEAD']);
    });

    test('every pushed ref is measured, not just the first', () => {
        expect(pendingRanges(`refs/heads/a ${sha('1')} refs/heads/a ${sha('2')}\nrefs/heads/b ${sha('3')} refs/heads/b ${sha('4')}`)).toHaveLength(2);
    });

    test('measureRange reads REAL git history, so the consumer is proven end to end', () => {
        const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf-8'}).trim(),
              head    = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gitRoot, encoding: 'utf-8'}).trim(),
              files   = measureRange(`${head}~1..${head}`, gitRoot);

        expect(Array.isArray(files)).toBe(true);
        files.forEach(row => {
            expect(row.added).toBeGreaterThan(0);
            expect(isInScopePath(row.file)).toBe(true);
            expect(row).toHaveProperty('longestRun');
            expect(row).toHaveProperty('confessions');
        });
    });

    test('an unresolvable range yields no files instead of throwing into the hook', () => {
        const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf-8'}).trim();

        expect(measureRange('definitely-not-a-ref..also-not-a-ref', gitRoot)).toEqual([]);
    });
});

test.describe('check-comment-density — scope and output', () => {
    test('measures source and specs, ignores everything else', () => {
        expect(isInScopePath('ai/services/x.mjs')).toBe(true);
        expect(isInScopePath('src/core/Base.mjs')).toBe(true);
        expect(isInScopePath('test/playwright/unit/x.spec.mjs')).toBe(true);
        expect(isInScopePath('learn/guide.md')).toBe(false);
        expect(isInScopePath('ai/config.json')).toBe(false);
        // A checker exempt from its own rule is not a rule.
        expect(isInScopePath('buildScripts/util/x.mjs')).toBe(true);
    });

    test('the warning prints every raw number, never only a verdict', () => {
        const text = formatDensityWarning(summarizeDensity([{file: 'b.mjs', added: 316, prose: 69, longestRun: 36, runs: [8, 12, 36]}]));

        expect(text).toContain('69 of 316');
        expect(text).toContain('longest contiguous run 36');
        // The median sits beside the longest, because the floor rising is invisible to a tail number.
        expect(text).toContain('median of 3 block(s) 12');
        expect(text).toContain('bar 35');
        expect(text).toContain('b.mjs');
    });
});
