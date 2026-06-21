import {execSync} from 'node:child_process';

/**
 * @summary Parses unified-diff text (`git diff --unified=0`) into the set of ADDED line numbers.
 *
 * Reads each hunk header `@@ -a,b +c,d @@` and emits the new-side line numbers `c .. c+d-1`
 * (`d` defaults to 1 when omitted; a `+c,0` pure-deletion hunk adds nothing). Pure and
 * side-effect-free so it is unit-testable without a git repository — the caller supplies the
 * diff text.
 *
 * @param {String} diffText Output of `git diff --unified=0 -- <file>` for a single file.
 * @returns {Set<Number>} 1-based new-side line numbers that the diff adds.
 */
export function parseAddedLines(diffText) {
    const added = new Set();

    if (!diffText) {
        return added;
    }

    const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

    for (const line of diffText.split('\n')) {
        const match = hunkRe.exec(line);

        if (!match) {
            continue;
        }

        const start = Number(match[1]),
              count = match[2] === undefined ? 1 : Number(match[2]);

        for (let i = 0; i < count; i++) {
            added.add(start + i);
        }
    }

    return added;
}

/**
 * @summary Returns the staged-ADDED line numbers for a file (the `+` side of `git diff --cached`).
 *
 * Lets pre-commit hygiene checks scope findings to the author's own change rather than
 * re-flagging grandfathered issues on untouched lines. Returns an empty set on any git failure;
 * the caller treats an empty set as "no added-line info" and should fall back to whole-file.
 *
 * @param {String} file    Path to the staged file.
 * @param {String} gitRoot Repository root (cwd for the git invocation).
 * @returns {Set<Number>} 1-based staged-added line numbers.
 */
export function getStagedAddedLines(file, gitRoot) {
    try {
        const diff = execSync(`git diff --cached --unified=0 -- "${file}"`, {cwd: gitRoot, encoding: 'utf-8'});

        return parseAddedLines(diff);
    } catch (e) {
        return new Set();
    }
}
