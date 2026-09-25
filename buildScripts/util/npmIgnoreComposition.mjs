import {readFileSync, writeFileSync} from 'node:fs';
import path                          from 'node:path';
import process                       from 'node:process';
import isEntryModule                 from './isEntryModule.mjs';

/**
 * @module buildScripts/util/npmIgnoreComposition
 * @summary Composes `.npmignore` where it is consumed. `npm pack` and `npm publish` run this as `prepack`,
 * and `postpack` takes the generated part out again, so only the header is committed.
 *
 * The composed file is `authoritative header + a copy of .gitignore`. The copy excludes what a working tree
 * holds and git does not track, such as plane data, secrets and test results, so every pack of a working tree
 * needs it. A clean checkout needs nothing from it: `.gitignore` matches no tracked file (a package spec arm
 * pins that), so an engine installed from a git commit, where npm runs `prepare` and never `prepack`, packs
 * the same files from the header alone. A committed copy had to be kept in step with `.gitignore` by hand,
 * and it lagged: between releases, every pack shipped a different package than the release would.
 * `--ignore-scripts` skips both hooks, so a pack run with it reads the header alone.
 *
 * ## Why the header owns paths, rather than winning by order
 *
 * Ignore files resolve last-match-wins, so an appended copy outranks the header: `.gitignore`'s `/dist`
 * re-excludes everything the header's `/dist/*` + `!/dist/parse5.mjs` re-included, and `npm pack` then drops
 * bundles the engine imports at module scope. Ordering the header last also fixes that, and leaves both
 * statements in the file with correctness resting on position — which nothing in the file states. Dropping
 * the copy's rule for a path the header names leaves ONE statement per path instead.
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
 * @param {String} text
 * @returns {String} The line separator `text` uses.
 */
function eolOf(text) {
    return text.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * @param {String[]} lines `.npmignore`, split into lines.
 * @returns {Number} The marker's index.
 * @throws {Error} When the marker is missing: nothing then says where the header ends, and a guess would
 * drop header rules from every pack.
 */
function markerIndexOf(lines) {
    const index = lines.indexOf(HEADER_MARKER);

    if (index === -1) {
        throw new Error(`.npmignore has no '${HEADER_MARKER}' line, so nothing marks where its header ends`)
    }

    return index
}

/**
 * @summary Composes `.npmignore`: the header verbatim, then the copy minus anything the header already governs.
 *
 * @param {String} npmIgnore Current `.npmignore` contents, composed or not. Its line separator is kept.
 * @param {String} gitIgnore Current `.gitignore` contents.
 * @returns {{content: String, dropped: Array<{line: String, owner: String}>}}
 *     `dropped` names each copied rule left out and the header path that owns it — `prepack` prints it,
 *     because a filter nobody can see is no better than the ordering rule it replaced.
 */
export function composeNpmIgnore(npmIgnore, gitIgnore) {
    const
        eol         = eolOf(npmIgnore),
        lines       = npmIgnore.split(eol),
        headerLines = lines.slice(0, markerIndexOf(lines) + 1),
        ownedPaths  = headerLines.filter(isRule).map(normalizePattern).filter(Boolean),
        dropped     = [],
        copyLines   = gitIgnore.split(/\r?\n/).filter(line => {
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
        dropped
    }
}

/**
 * @summary The committed form of `.npmignore`: everything through the marker. `postpack` writes it back.
 * @param {String} npmIgnore `.npmignore` contents, composed or not.
 * @returns {String}
 */
export function headerOf(npmIgnore) {
    const eol   = eolOf(npmIgnore),
          lines = npmIgnore.split(eol);

    return lines.slice(0, markerIndexOf(lines) + 1).join(eol) + eol
}

/**
 * @summary Runs `fn` with `.npmignore` composed, then puts the file back as it was. For a pack that passes
 * `--ignore-scripts`, which runs neither `prepack` nor `postpack`.
 * @param {String} root The package root.
 * @param {Function} fn Runs synchronously: the file is put back as soon as it returns.
 * @returns {*} What `fn` returns.
 */
export function withComposedNpmIgnore(root, fn) {
    const npmIgnorePath = path.join(root, '.npmignore'),
          npmIgnore     = readFileSync(npmIgnorePath, 'utf8');

    writeFileSync(npmIgnorePath, composeNpmIgnore(npmIgnore, readFileSync(path.join(root, '.gitignore'), 'utf8')).content);

    try {
        return fn()
    } finally {
        writeFileSync(npmIgnorePath, npmIgnore)
    }
}

if (isEntryModule(import.meta.url)) {
    // npm runs lifecycle scripts from the package root, so the working directory is the tree being packed.
    const npmIgnorePath = path.resolve('.npmignore'),
          npmIgnore     = readFileSync(npmIgnorePath, 'utf8'),
          mode          = process.argv[2];

    if (mode === 'compose') {
        const {content, dropped} = composeNpmIgnore(npmIgnore, readFileSync(path.resolve('.gitignore'), 'utf8'));

        writeFileSync(npmIgnorePath, content);

        // stderr, because `npm pack --json` prints its report on stdout
        dropped.forEach(({line, owner}) => console.error(`.npmignore: dropped from the copy: ${line}  (the header owns ${owner})`))
    } else if (mode === 'restore') {
        writeFileSync(npmIgnorePath, headerOf(npmIgnore))
    } else {
        throw new Error(`npmIgnoreComposition: expected 'compose' or 'restore', got '${mode}'`)
    }
}
