import {execFileSync} from 'node:child_process';

/**
 * @module buildScripts/util/check-parse
 * @summary Commit-time syntax gate: `node --check` every staged `.mjs`, failing the commit if any no
 * longer parses. It is the durable backstop for mechanical rewrites whose output ships un-run — most
 * notably `check-block-alignment.mjs --fix`, which an author invokes AFTER the local test pass, so an
 * aligner edge case that turns valid source into a `SyntaxError` would otherwise commit green locally and
 * only blow up in CI when a spec imports the file (every importing spec throws — a full wasted CI cycle).
 * A mechanical fixer will always have edge cases; a parse gate catches all of them, present and future,
 * regardless of which fixer (or hand-edit) produced the break.
 *
 * A syntax error is never a legitimate commit, so this scopes to the WHOLE staged file (not the
 * author's added lines — unlike the diff-scoped alignment check) and needs no git-diff context.
 * `node --check` parses module syntax WITHOUT executing, so no imports are resolved and no module side
 * effects run. Wired last in the `*.mjs` lint-staged chain, after the mechanical fixers it backstops.
 *
 * Usage:
 *   node buildScripts/util/check-parse.mjs <file.mjs> [...]   # exit 1 if any file fails to parse
 */

const files = process.argv.slice(2).filter(arg => arg.endsWith('.mjs'));

const unparseable = [];

for (const file of files) {
    // `node --check` on the current interpreter: syntax-only, no execution. A non-zero exit throws, and
    // the SyntaxError (with its file:line:col caret) is on stderr — surfaced verbatim so the author can
    // locate the break without re-running anything.
    try {
        execFileSync(process.execPath, ['--check', file], {encoding: 'utf8', stdio: 'pipe'});
    } catch (err) {
        unparseable.push({file, detail: (err.stderr || err.message || '').trim()});
    }
}

if (unparseable.length > 0) {
    console.error(`check-parse: ${unparseable.length} staged .mjs file(s) no longer parse:`);
    for (const {file, detail} of unparseable) {
        console.error(`  ${file}`);
        if (detail) console.error(detail.split('\n').map(line => `    ${line}`).join('\n'));
    }
    console.error('\nA syntax error must never be committed. If a mechanical fixer (e.g. check-block-alignment --fix) produced it, revert that rewrite and align the block by hand, then report the input as a fixer bug (see #15072).');
    process.exit(1);
}
