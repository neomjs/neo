import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';
import isEntryModule   from './isEntryModule.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-package-contents
 * @summary Asserts what the published tarball actually contains, because nothing else does.
 *
 * ## The defect class
 *
 * `package.json` declares no `files` array, so `.npmignore` is the sole gate on package contents —
 * every line in it is load-bearing, and none of them is observed. Two live defects landed there and
 * neither failed anything:
 *
 * - A rule pinned to a path and an extension (`apps/devindex/resources/*.json`) stopped matching
 *   when the corpus moved into `data/` and grew a `.jsonl`. It became vacuous silently; 26.5 MiB
 *   shipped to every consumer.
 * - A negation under a bare directory exclusion (`.neo-ai-data` + `!.neo-ai-data/concepts/`) did not
 *   widen that exclusion, it removed it — making server logs, wake-daemon state, and the Memory Core
 *   SQLite graph packable on any machine where those files exist.
 *
 * The second is the reason this script exists rather than a careful re-reading of `.npmignore`. It
 * produces a *correct-looking* package on a checkout whose `.neo-ai-data` happens to hold only the
 * carved-out subtree, and a wrong one everywhere else. Inspecting one clean tarball confirms the
 * wrong answer. Only packing a checkout that actually holds the files can falsify it — so the check
 * has to run the real `npm pack`, and reasoning about ignore-file semantics is explicitly not a
 * substitute. That reasoning is what produced both defects.
 *
 * ## What it does NOT do
 *
 * It does not audit `.npmignore` line by line, and it is not an allowlist of everything that may
 * ship. It names the directories and the file classes that must never ship, so that a future pattern
 * which quietly stops matching fails here instead of in the registry.
 */

/**
 * Directories that must not appear in the tarball, each with the exact subtrees deliberately
 * carved out of it. A carve-out is spelled as a prefix so the intent stays readable next to the
 * rule it mirrors — and so an ADDED sibling of a carve-out fails rather than inheriting its pass.
 *
 * Directory rules cover private plane state and generated browser dependencies. The public portal's
 * individual SEO files remain ordinary ignore rules; they are outside these tree-wide contracts.
 * @type {Array<{prefix: String, allow: String[], why: String}>}
 */
export const FORBIDDEN_PREFIXES = [
    {
        prefix: 'dist/',
        allow : [],
        why   : 'Generated browser dependencies and build outputs belong to the consuming workspace, not the source-only npm package.'
    },
    {
        prefix: '.neo-ai-data/',
        allow : [],
        why   : 'Agent OS plane state — server logs, wake-daemon files, deployment snapshots, and the Memory Core SQLite graph (agent memories, session records, A2A edges). Nothing under it ships; the concept ontology lives in the plane.'
    }
];

/**
 * @summary File classes that must not appear in the tarball, whatever folder holds them.
 *
 * A class, because the specs lie beside the configs and fixtures that workspaces import, and because the
 * copy of `.gitignore` re-includes every `.mjs` file of a shipped app: a spec placed there passes the
 * ignore rule and is found here.
 * @type {Array<{suffix: String, why: String}>}
 */
export const FORBIDDEN_SUFFIXES = [
    {
        suffix: '.spec.mjs',
        why   : 'The engine\'s own specs. Workspaces import the Playwright configs, setup.mjs, fixtures.mjs and their helpers from the test tree; nothing outside this repository runs the engine\'s suite.'
    }
];

/**
 * @summary Pure predicate: which packed paths violate a forbidden prefix or suffix rule?
 *
 * Split out from the `npm pack` invocation so the rule logic is unit-testable without spawning a
 * pack, and so a red-proof can plant a violating path directly instead of manufacturing one on disk.
 *
 * @param {String[]} packedPaths Tarball-relative paths, as reported by `npm pack --json`.
 * @param {Array<Object>} [rules] The rules to enforce: the prefix and the suffix rules by default.
 * @returns {Array<{path: String, prefix: String, suffix: String, why: String}>} One entry per violating
 *          path, carrying the `prefix` or the `suffix` of the rule it broke.
 */
export function findForbiddenEntries(packedPaths, rules = [...FORBIDDEN_PREFIXES, ...FORBIDDEN_SUFFIXES]) {
    const findings = [];

    for (const packedPath of packedPaths) {
        for (const rule of rules) {
            if (rule.suffix) {
                packedPath.endsWith(rule.suffix) && findings.push({path: packedPath, suffix: rule.suffix, why: rule.why});
                continue
            }

            if (!packedPath.startsWith(rule.prefix)) {
                continue
            }

            if (rule.allow.some(allowed => packedPath.startsWith(allowed))) {
                continue
            }

            findings.push({path: packedPath, prefix: rule.prefix, why: rule.why})
        }
    }

    return findings
}

/**
 * @summary The rule a contributor reads when a frame fails this check.
 *
 * It lives here, in the failure text, because a rule that lives in a review does not hold: the same
 * defect came back three times in three days after it was written down once in a review. A check
 * states it every time it fires.
 * @type {String}
 */
export const FRAME_RULE = `A pull request's frames do not belong in the tree. Commit them, link them pinned to that
commit (https://github.com/neomjs/neo/blob/<sha>/<path>?raw=true), and remove them in a later commit of the
same pull request; its ref keeps the commit served.`;

/**
 * @summary The baseline's own path in the tarball, which is a file the guard must not read as evidence.
 *
 * The list is packed like any other text file, and every `path` row spells the image it exempts, so a
 * reader that counts it names every baselined frame and retires every row. An exemption list is not a
 * reference: it records what nothing else says.
 * @type {String}
 */
const BASELINE_FILE = 'buildScripts/util/check-package-contents-baseline.json';

/** @summary What a packed image is, and what may name it. */
export const IMAGE_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp']),
             TEXT_EXTENSIONS  = Object.freeze(['mjs', 'js', 'json', 'scss', 'css', 'md', 'html', 'yaml', 'yml', 'txt', 'svg']);

// Built from the arrays above, so adding an extension to one of them is the only edit a new format needs.
const IMAGE_ALTERNATIVES = IMAGE_EXTENSIONS.join('|'),
      TEXT_ALTERNATIVES  = TEXT_EXTENSIONS.join('|');

const IMAGE_PATTERN = new RegExp(`[\\w.\\-/@:%]+?\\.(?:${IMAGE_ALTERNATIVES})\\b`, 'gi'),
      IMAGE_TEST    = new RegExp(`\\.(?:${IMAGE_ALTERNATIVES})$`, 'i'),
      TEXT_TEST     = new RegExp(`\\.(?:${TEXT_ALTERNATIVES})$`, 'i');

/**
 * @summary Frames whose name is not a literal in the tree, each with the reason it cannot be one.
 *
 * The baseline is a list of what the guard cannot derive, not a list of what may ship. Every entry is
 * either a `path` (one file) or a `prefix` (a folder whose contents are named by a pattern), and every
 * entry states why — the failure message is the whole product, so a baseline without reasons would
 * turn a rule into a shrug. The `resources/images/circle` folder is the model: `src/component/Circle.mjs`
 * holds the folder and the three file names apart and joins them at runtime, so no file names one of
 * those images by folder and file name.
 *
 * The list is a ratchet and is read in both directions: an entry that no longer covers an unnamed
 * image fails the check, so a row cannot outlive the fact it records.
 * @type {Array<{path?: String, prefix?: String, why: String}>}
 */
export const IMAGE_BASELINE = Object.freeze(JSON.parse(fs.readFileSync(
    path.join(ROOT, BASELINE_FILE),
    'utf8'
)));

/**
 * @summary The two path segments a reference has to match, so a bare file name does not count.
 *
 * The parent folder is what makes this check useful: `dark.png` occurs in several folders, so a
 * bare-name match passes a frame that shipped from another folder. A file at the tarball root has no
 * parent, and its own name is then the whole key.
 *
 * @param {String} packedPath Tarball-relative path of a packed image.
 * @returns {String} `folder/file.ext`, or `file.ext` for a root-level file.
 */
export function imageReferenceKey(packedPath) {
    const segments = packedPath.split('/');

    return segments.length < 2 ? segments[0] : segments.slice(-2).join('/')
}

/**
 * @summary Pure predicate: which packed images does no packed text file name?
 *
 * Split out from the `npm pack` invocation for the same reasons as `findForbiddenEntries`: the rule
 * logic is unit-testable without spawning a pack, and a red-proof can plant a path instead of
 * manufacturing one on disk.
 *
 * The reader is the caller's, because the entry block reads from the checkout while a spec feeds
 * synthetic content. An unreadable text file is skipped, which is the safe direction: the images it
 * would have named stay unnamed and the check reds, instead of the check throwing over a file it
 * could not open.
 *
 * The baseline is skipped: it spells the images it exempts, so counting it would name every frame the
 * guard was told to leave alone and retire every row.
 *
 * @param {String[]} packedPaths Tarball-relative paths, as reported by `npm pack --json`.
 * @param {Function} readTextFile `(packedPath) => String|undefined`, the content of a packed text file.
 * @param {Object}   [options]
 * @param {String[]} [options.ignoredFiles=[BASELINE_FILE]] Packed files whose text is not evidence.
 * @returns {String[]} Every unnamed image, in packed order.
 */
export function collectUnnamedImages(packedPaths, readTextFile, {ignoredFiles = [BASELINE_FILE]} = {}) {
    const referenced = new Set();

    for (const packedPath of packedPaths) {
        if (!TEXT_TEST.test(packedPath) || ignoredFiles.includes(packedPath)) {
            continue
        }

        const content = readTextFile(packedPath);

        if (typeof content !== 'string') {
            continue
        }

        for (const match of content.matchAll(IMAGE_PATTERN)) {
            const segments = match[0].split('/').filter(segment => segment && segment !== '.' && segment !== '..');

            if (segments.length > 1) {
                referenced.add(segments.slice(-2).join('/'))
            }
        }
    }

    return packedPaths.filter(packedPath => IMAGE_TEST.test(packedPath) &&
        !referenced.has(imageReferenceKey(packedPath)))
}

/**
 * @summary Compares the live unnamed images against the recorded baseline, in both directions.
 *
 * `added` fails up: an unnamed packed image the baseline does not cover.
 *
 * `stale` fails down: a baseline entry that covers no unnamed image any more. Its file was unpacked
 * or deleted, it is now named by folder and file name, or its prefix covers nothing. The ratchet is
 * symmetric, following `check-class-module-scope` and `check-engine-brain-boundary`: a row that stays
 * past the fact it records turns the baseline into a history of what used to be true, and the next
 * reader cannot tell which rows still buy something.
 *
 * @param {String[]} unnamedImages Live unnamed images, from `collectUnnamedImages`.
 * @param {Array<Object>} [baseline=IMAGE_BASELINE] The entries whose absence of a reference is known.
 * @returns {{added: String[], stale: Object[]}} Unnamed images the baseline misses, and entries that
 *          cover nothing.
 */
export function diffImageBaseline(unnamedImages, baseline = IMAGE_BASELINE) {
    const unnamed = new Set(unnamedImages);

    const added = unnamedImages.filter(packedPath => !baseline.some(entry => entry.path === packedPath ||
        (entry.prefix && packedPath.startsWith(entry.prefix))));

    const stale = baseline.filter(entry => entry.path
        ? !unnamed.has(entry.path)
        : !unnamedImages.some(packedPath => packedPath.startsWith(entry.prefix)));

    return {added, stale}
}

/**
 * @summary Extracts the JSON payload from `npm pack --json` output.
 *
 * Lifecycle scripts write to stdout ahead of the payload, so the raw output is not parseable as-is.
 * The payload starts at the first line that opens a JSON array or an object, whichever comes first:
 * npm 12 keys `pack --json` by package name and reports an object, npm 11 and earlier report an array,
 * and both carry the same report. A lifecycle line that opens one of its own takes that position and
 * `JSON.parse` then rejects whatever follows it — the gate reds, which is the safe direction and the
 * reason the search is anchored on a line of its own rather than on any `[` or `{`.
 *
 * **The leading newline is not required.** Matching only `'\n[\n'` meant a payload beginning at
 * offset 0 — which is what happens the moment the `prepare` lifecycle stops writing to stdout — threw
 * `no JSON array found` over output that had one. The direction of that failure was safe (a throw
 * exits non-zero and reds the gate, so it could never false-PASS), but a guard that fails on a clean
 * environment is a guard people learn to distrust. Raised by @neo-opus-grace on review.
 *
 * @param {String} raw Combined stdout of the pack invocation.
 * @returns {Object[]} The parsed pack report.
 * @throws {Error} When no line opens a JSON array or object.
 */
export function parsePackOutput(raw) {
    const arrayStart  = raw.startsWith('[\n') ? 0 : raw.indexOf('\n[\n'),
          objectStart = raw.startsWith('{\n') ? 0 : raw.indexOf('\n{\n'),
          // The first line that opens one of the two shapes is the payload; there is no precedence
          // between them beyond position.
          start       = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart) ? arrayStart : objectStart;

    if (start === -1) {
        throw new Error('check-package-contents: no JSON array or object found in `npm pack --json` output')
    }

    const parsed = JSON.parse(raw.slice(start));

    return Array.isArray(parsed) ? parsed : Object.values(parsed)
}

if (isEntryModule(import.meta.url)) {
    // `prepack` composes .npmignore first, so this judges the file set `npm publish` would ship
    const raw    = execFileSync('npm', ['pack', '--dry-run', '--json'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}),
          report = parsePackOutput(raw)[0],
          files  = report.files.map(file => file.path),
          found  = findForbiddenEntries(files);

    if (found.length) {
        console.error(`\x1b[31mcheck-package-contents: ${found.length} forbidden entr(ies) in the npm tarball:\x1b[0m`);

        const byRule = new Map();

        for (const finding of found) {
            const rule = finding.prefix || `*${finding.suffix}`;

            byRule.set(rule, byRule.get(rule) || {why: finding.why, paths: []});
            byRule.get(rule).paths.push(finding.path)
        }

        for (const [rule, group] of byRule) {
            console.error(`\n  ${rule} — ${group.paths.length} file(s)`);
            console.error(`    ${group.why}`);
            group.paths.slice(0, 10).forEach(entry => console.error(`      ${entry}`));

            if (group.paths.length > 10) {
                console.error(`      … and ${group.paths.length - 10} more`)
            }
        }

        console.error(`
An .npmignore rule that used to cover these has stopped covering them. Do not fix it by reading the
patterns — that is what produced the defects this check exists for. Change the rule, re-run this
check, and let the pack decide.`);

        process.exit(1)
    }

    // Reads from the checkout, because the tarball's text files are the ones that can name a frame
    const unnamed = collectUnnamedImages(files, packedPath => {
        try {
            return fs.readFileSync(path.join(ROOT, packedPath), 'utf8')
        } catch (error) {
            return undefined
        }
    });

    const {added, stale} = diffImageBaseline(unnamed);

    if (added.length || stale.length) {
        if (added.length) {
            console.error(`\x1b[31mcheck-package-contents: ${added.length} packed image(s) that no packed text file names by folder and file name:\x1b[0m`);

            added.slice(0, 20).forEach(packedPath => console.error(`      ${packedPath}`));

            if (added.length > 20) {
                console.error(`      … and ${added.length - 20} more`)
            }

            console.error(`\n${FRAME_RULE}\n
A frame a record set names at runtime cannot be named by a literal. Add it to
buildScripts/util/check-package-contents-baseline.json as a path or a folder prefix, with its reason.`)
        }

        if (stale.length) {
            console.error(`\x1b[31mcheck-package-contents: ${stale.length} baseline entr(ies) that cover no unnamed image:\x1b[0m`);

            stale.forEach(entry => console.error(`      ${entry.path || entry.prefix} — ${entry.why}`));

            console.error(`
The baseline is a ratchet, read in both directions. An entry whose file was unpacked, deleted or is now
named by folder and file name buys nothing any more: remove the row in the same commit that made it true.`)
        }

        process.exit(1)
    }

    console.log(`check-package-contents: OK — ${report.entryCount} files, ${(report.size / 1048576).toFixed(2)} MiB tarball, ${(report.unpackedSize / 1048576).toFixed(2)} MiB unpacked; no forbidden entries, every packed image named.`)
}
