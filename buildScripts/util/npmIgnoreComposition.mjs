/**
 * @module buildScripts/util/npmIgnoreComposition
 * @summary The single definition of how a release rebuilds `.npmignore`, so the step that writes it
 * and the guard that checks it cannot disagree.
 *
 * `buildScripts/release/prepare.mjs` regenerates `.npmignore` on every release, and
 * `buildScripts/util/check-package-contents.mjs` has to predict what that produces in order to fail
 * BEFORE a release rather than after one. Two implementations of the same composition means the guard
 * certifies its own copy: it can be green against a release step that behaves differently, which is
 * the one failure mode a pre-release guard must not have. Both import this.
 *
 * ## Why the header owns paths, rather than winning by order
 *
 * The file is `authoritative header + a copy of .gitignore`. Ignore files resolve last-match-wins, so
 * an appended copy outranks the header: `.gitignore`'s `/dist` re-excludes everything the header's
 * `/dist/*` + `!/dist/parse5.mjs` re-included, and `npm pack` then drops bundles the engine imports at
 * module scope. Ordering the header last also fixes that, and leaves both statements in the file with
 * correctness resting on position — which nothing in the file states. Dropping the copy's rule for a
 * path the header names leaves ONE statement per path instead.
 *
 * ## Normalization is symmetric, and that is the whole correctness argument
 *
 * `/dist`, `dist`, `dist/` and `/dist/*` all name the same directory to an ignore file. Comparing a
 * normalized header pattern against a raw copy pattern therefore misses every spelling but one:
 * measured, with `.gitignore` spelling it `dist/`, the copy survives the filter, the composed file
 * excludes the whole tree, and a guard built on the same asymmetry reports nothing lost. Both sides go
 * through {@link normalizePattern} for that reason, and an arm pins each spelling.
 */

/**
 * The line separating the hand-maintained header from the generated copy.
 * @type {String}
 */
export const HEADER_MARKER = '# Original content of the .gitignore file';

/**
 * @param {String} line
 * @returns {Boolean} true for a rule, false for a comment or a blank line
 */
export function isRule(line) {
    return Boolean(line.trim()) && !line.trim().startsWith('#')
}

/**
 * @summary The directory or file an ignore pattern names, stripped of the spellings that do not change it.
 *
 * A negation marker, a leading slash, a trailing slash and a trailing `/*` are all presentation: `!/dist/*`
 * and `dist` name the same tree. Anything else is left alone, so `!/dist/parse5.mjs` normalizes to
 * `dist/parse5.mjs` and keeps naming one file.
 * @param {String} pattern
 * @returns {String}
 */
export function normalizePattern(pattern) {
    return pattern.trim()
        .replace(/^!/,    '')
        .replace(/\/\*$/, '')
        .replace(/^\//,   '')
        .replace(/\/$/,   '')
}

/**
 * @summary Rebuilds `.npmignore` the way a release does: the header verbatim, then the copy minus
 * anything the header already governs.
 *
 * @param {String} npmIgnore Current `.npmignore` contents.
 * @param {String} gitIgnore Current `.gitignore` contents.
 * @param {String} [eol='\n'] Line separator to compose with.
 * @returns {{content: String, headerLines: String[], dropped: Array<{line: String, owner: String}>}}
 *     `dropped` names each copied rule left out and the header path that owns it — the release step
 *     prints it, because a filter nobody can see is no better than the ordering rule it replaced.
 */
export function composeNpmIgnore(npmIgnore, gitIgnore, eol = '\n') {
    const
        lines       = npmIgnore.split(eol),
        markerIndex = lines.indexOf(HEADER_MARKER),
        // No marker means no generated region to reason about: hand the file back untouched rather
        // than guessing where the boundary was.
        headerLines = markerIndex === -1 ? lines.slice(0, 7) : lines.slice(0, markerIndex + 1),
        ownedPaths  = headerLines.filter(isRule).map(normalizePattern).filter(Boolean),
        dropped     = [],
        copyLines   = gitIgnore.split(eol).filter(line => {
            if (!isRule(line)) {
                return true
            }

            const
                pattern = normalizePattern(line),
                owner   = ownedPaths.find(owned => pattern === owned || pattern.startsWith(`${owned}/`));

            owner && dropped.push({line: line.trim(), owner});

            return !owner
        });

    return {
        content: headerLines.join(eol) + eol + copyLines.join(eol),
        dropped,
        headerLines
    }
}
