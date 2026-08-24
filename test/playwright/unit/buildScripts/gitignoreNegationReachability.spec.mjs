import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * @summary Every `!` line in the repository `.gitignore` must actually be able to un-ignore something.
 *
 * **The failure this guards.** Git does not descend into an ignored directory, so a negation placed
 * beneath a bare directory rule never participates. `.neo-ai-data` + `!.neo-ai-data/concepts/` read
 * exactly like the working `.gemini/*` + `!.gemini/concepts/` two blocks away, and only one of them
 * does anything. Nothing is red when it breaks: existing tracked files keep working because git
 * grandfathers already-tracked paths, so the cost lands on the *next* file added under that
 * directory — silently absent from `git status`, silently absent from `git add`.
 *
 * **Why this materialises a real tree instead of probing paths.** `git check-ignore` answers a
 * different question than it appears to, in three ways, each of which produced a wrong answer while
 * this guard was being written:
 *
 * 1. It exits `0` when **any** rule matches — including a negation. Reading the exit code as
 *    "ignored" reported 20 dead negations where there was one.
 * 2. Given a path that does **not exist**, beneath a directory that **is** ignored, it reports no
 *    match at all. "No rule matched" is not "not ignored", and a synthetic probe hits this every
 *    time the parent is exactly the directory under test.
 * 3. Consequently a hypothetical path cannot answer the question at all. So each probe is written to
 *    disk in a scratch repository carrying the real `.gitignore`, and the verdict comes from
 *    `git status --porcelain`, which is the behaviour anyone actually depends on.
 *
 * **Each negation is tested against its own control.** A rule is reachable when the probe is visible
 * WITH the negation present and ignored WITHOUT it. The second half is what stops the guard passing
 * vacuously on a probe that no rule would have ignored in the first place.
 */

const
    ROOT_DIR       = path.resolve(process.cwd()),
    GITIGNORE_PATH = path.join(ROOT_DIR, '.gitignore'),
    PROBE_DIR      = 'probe-dir',
    PROBE_LEAF     = 'probe-leaf';

/**
 * @typedef {Object} Negation
 * @property {Number} line  1-based line number in `.gitignore`.
 * @property {String} rule  The raw `!…` line.
 * @property {String} probe Repo-relative path the rule intends to keep visible.
 */

/**
 * @summary Turns a negation pattern into one concrete path it is meant to un-ignore.
 *
 * A wrong derivation is the quiet way this guard could pass on everything, so the mapping is
 * asserted directly by its own arm rather than only exercised through the sweep.
 *
 * @param {String} rule A `.gitignore` line beginning with `!`.
 * @returns {String} A repo-relative probe path.
 */
export function deriveProbePath(rule) {
    let pattern = rule.slice(1).trim();

    const isDirectory = pattern.endsWith('/');

    pattern = pattern.replace(/^\/+/, '').replace(/\/+$/, '');

    const segments = pattern.split('/').map(segment => {
        if (segment === '**')  return PROBE_DIR;
        if (segment === '*')   return PROBE_LEAF;
        return segment.includes('*') ? segment.replace(/\*/g, PROBE_LEAF) : segment
    });

    if (isDirectory) {
        segments.push(`${PROBE_LEAF}.jsonl`)
    }

    return segments.join('/')
}

/**
 * @summary Lists the negations in a `.gitignore`, skipping comments and blanks.
 * @param {String} content
 * @returns {Negation[]}
 */
export function readNegations(content) {
    return content.split('\n').flatMap((raw, index) => {
        const rule = raw.trim();

        return rule.startsWith('!') ? [{line: index + 1, rule, probe: deriveProbePath(rule)}] : []
    })
}

/**
 * @summary Materialises every probe in a scratch repository and reports which paths git can see.
 *
 * @param {String} content   The `.gitignore` body to install.
 * @param {String[]} probes  Repo-relative probe paths to create.
 * @returns {Set<String>} The probes git reports as untracked, i.e. NOT ignored.
 */
export function visibleProbes(content, probes) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-gitignore-'));

    try {
        execFileSync('git', ['init', '-q', '.'], {cwd: dir});
        fs.writeFileSync(path.join(dir, '.gitignore'), content, 'utf8');

        for (const probe of probes) {
            const target = path.join(dir, probe);

            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, 'probe\n', 'utf8')
        }

        const seen = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {cwd: dir, encoding: 'utf8'});

        return new Set(
            seen.split('\n')
                .map(row => row.slice(3).trim())
                .filter(Boolean)
                .map(row => row.replace(/^"|"$/g, ''))
        )
    } finally {
        fs.rmSync(dir, {recursive: true, force: true})
    }
}

/**
 * @summary Reports every negation git cannot reach, each judged against its own without-the-rule control.
 * @param {String} content
 * @returns {{checked: Number, dead: Negation[], inert: Negation[]}}
 */
export function unreachableNegations(content) {
    const
        negations = readNegations(content),
        probes    = negations.map(negation => negation.probe),
        withRules = visibleProbes(content, probes),
        dead      = [],
        inert     = [];

    for (const negation of negations) {
        const
            withoutRule = content.split('\n').filter((_, index) => index + 1 !== negation.line).join('\n'),
            controlSeen = visibleProbes(withoutRule, [negation.probe]);

        if (!withRules.has(negation.probe)) {
            dead.push(negation)
        } else if (controlSeen.has(negation.probe)) {
            // Visible either way: the rule un-ignores nothing. Not a failure — a redundant line is
            // harmless where an unreachable one is a trap — but reported so it can be retired.
            inert.push(negation)
        }
    }

    return {checked: negations.length, dead, inert}
}

test.describe('.gitignore negation reachability (#17697)', () => {

    test('probe derivation maps a pattern onto a path the rule is actually about', () => {
        expect(deriveProbePath('!/apps/agentos/index.html')).toBe('apps/agentos/index.html');
        expect(deriveProbePath('!/apps/agentos/**/*.mjs')).toBe(`apps/agentos/${PROBE_DIR}/${PROBE_LEAF}.mjs`);
        expect(deriveProbePath('!/apps/agentos/design/*.html')).toBe(`apps/agentos/design/${PROBE_LEAF}.html`);
        expect(deriveProbePath('!.neo-ai-data/concepts/')).toBe(`.neo-ai-data/concepts/${PROBE_LEAF}.jsonl`);
        expect(deriveProbePath('!/docs/output/class-hierarchy.json')).toBe('docs/output/class-hierarchy.json')
    });

    test('POSITIVE CONTROL: a bare directory above a negation is reported dead', () => {
        // The exact shape the repository shipped. Without this arm a guard that always returns an
        // empty list would pass every other test in this file.
        const result = unreachableNegations('buildout\n!buildout/keep/\n');

        expect(result.checked).toBe(1);
        expect(result.dead.map(negation => negation.rule)).toEqual(['!buildout/keep/'])
    });

    test('POSITIVE CONTROL: the same pair written as contents-not-directory is reachable', () => {
        // The fix, proven to be a fix rather than merely different: one character apart from the arm
        // above, opposite verdict.
        const result = unreachableNegations('buildout/*\n!buildout/keep/\n');

        expect(result.dead).toEqual([]);
        expect(result.inert).toEqual([])
    });

    test('a negation that un-ignores nothing is reported inert, not dead', () => {
        const result = unreachableNegations('unrelated-path\n!buildout/keep/\n');

        expect(result.dead).toEqual([]);
        expect(result.inert.map(negation => negation.rule)).toEqual(['!buildout/keep/'])
    });

    test('every negation in the repository .gitignore is reachable', () => {
        const
            content = fs.readFileSync(GITIGNORE_PATH, 'utf8'),
            result  = unreachableNegations(content);

        // Reach, stated in the output rather than assumed by the reader: this guard covers the
        // repository-root `.gitignore` and nothing else. Nested `.gitignore` files, `.git/info/exclude`
        // and any global ignore are unexamined, so a green here says nothing about them.
        console.log(`gitignore negation reachability: ${result.checked} negations checked in .gitignore (repo root only — nested .gitignore, .git/info/exclude and global ignores are NOT covered)`);

        if (result.inert.length) {
            console.log(`  inert (harmless, retirable): ${result.inert.map(negation => `L${negation.line} ${negation.rule}`).join(', ')}`)
        }

        expect(
            result.dead.map(negation => `L${negation.line} ${negation.rule} (probe: ${negation.probe})`)
        ).toEqual([])
    })
});
