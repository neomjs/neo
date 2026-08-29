#!/usr/bin/env node
/**
 * @module buildScripts/util/check-relative-links
 * @summary Fails loud when a markdown file under `learn/**` links to a path the repository does not
 * contain. Custody decisions move targets; nothing moved the referrers, and until this guard existed
 * nothing could see the difference.
 *
 * ### Why it resolves against git rather than the filesystem
 *
 * The population this guard exists for is invisible to a filesystem check. A local checkout that
 * still carries trees a merge removed reports every link healthy, because the targets are sitting
 * right there untracked. So membership is tested against `git ls-files` — the **index** — which:
 *
 *   - excludes files that exist on disk but are not tracked (the stale-checkout blind spot),
 *   - includes files staged but not yet committed, so a PR may add a guide and link to it in one
 *     commit without tripping the guard,
 *   - is identical to the committed tree in CI, where the checkout is fresh.
 *
 * ### Three link classes, because two of them are not filesystem paths at all
 *
 * A naive resolver reports all three as broken and drowns the real findings — measured on this very
 * repository, where a first pass produced 17 findings of which only 7 were real:
 *
 *   1. **Relative** (`../guides/X.md`) — resolved against the referring file's directory.
 *   2. **Root-absolute** (`/learn/comparisons/X.md`) — resolved against the repository root. Joining
 *      these to the referrer's directory is what invented six of those ten false positives.
 *   3. **Portal refs** (`guides.events.DomEvents`) — the portal's own dotted addressing, not paths.
 *      Skipped, and counted separately so the skip is visible rather than silent.
 *
 * External URLs, anchors and `mailto:` are out of scope by construction: link *liveness* is a
 * different instrument with different failure modes, and mixing them would make this guard flaky.
 *
 * `collectDeadLinks` is pure over its inputs (injectable file set and reader, no exit/log) so the
 * CLI wrapper and an isolated spec can both drive it.
 */
import {execFileSync}  from 'child_process';
import path            from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot  = path.resolve(__dirname, '../..'),

      /** Directories whose markdown files are scanned for referrers. */
      SCAN_ROOTS = ['learn/'],

      /** Suffixes that make a slash-less target a file path rather than a portal ref. */
      FILE_SUFFIXES = ['.md', '.mjs', '.js', '.json', '.scss', '.css', '.html', '.png', '.jpg', '.svg'],

      INLINE_LINK    = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      REFERENCE_LINK = /^\s{0,3}\[[^\]]+\]:\s*(\S+)/gm,
      HTML_HREF      = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

/**
 * Extracts every link target from one markdown document, across all three syntaxes.
 *
 * Reference-style and HTML links are read as well as inline ones: a guard that only understands
 * `[x](y)` reports a document clean while its `[x]: y` definitions rot, and "no findings" from a
 * partial parser is indistinguishable from "no problems".
 * @param {String} markdown
 * @returns {String[]}
 */
export function extractLinkTargets(markdown) {
    const targets = [];

    for (const re of [INLINE_LINK, REFERENCE_LINK, HTML_HREF]) {
        re.lastIndex = 0;

        let match;

        while ((match = re.exec(markdown)) !== null) {
            targets.push(match[1])
        }
    }

    return targets
}

/**
 * Classifies one raw link target.
 * @param {String} target
 * @returns {{kind: 'external'|'portal'|'path', value: String}}
 */
export function classifyTarget(target) {
    if (/^(https?:|mailto:|tel:|data:|#)/.test(target)) {
        return {kind: 'external', value: target}
    }

    // strip the fragment and query — `X.md#section` addresses the same file
    const value = target.split('#')[0].split('?')[0].trim();

    if (!value) {
        return {kind: 'external', value: target}
    }

    if (!value.includes('/') && !FILE_SUFFIXES.some(suffix => value.endsWith(suffix))) {
        return {kind: 'portal', value}
    }

    return {kind: 'path', value}
}

/**
 * Resolves every path-shaped link in `files` and reports the ones the tracked set does not contain.
 *
 * @param {Object}   options
 * @param {String[]} options.files Repo-relative markdown paths to scan.
 * @param {Set}      options.tracked Every repo-relative path git knows about.
 * @param {Function} options.read `(repoRelativePath) => String`
 * @returns {{findings: Object[], checked: Number, skipped: Number}}
 */
export function collectDeadLinks({files, tracked, read}) {
    // A link may address a directory (`../guides/`); derive the directory set once.
    const dirs = new Set();

    for (const entry of tracked) {
        const parts = entry.split('/');

        for (let i = 1; i < parts.length; i++) {
            dirs.add(parts.slice(0, i).join('/'))
        }
    }

    const findings = [];
    let   checked  = 0,
        skipped = 0;

    for (const file of files) {
        const base = path.posix.dirname(file);

        for (const raw of extractLinkTargets(read(file))) {
            const {kind, value} = classifyTarget(raw);

            if (kind === 'external') continue;
            if (kind === 'portal')  { skipped++; continue }

            checked++;

            // `normalize` preserves a trailing slash, and the directory set has none — so a link
            // written `./guides/` would miss a directory that is right there. Strip it before lookup.
            const resolved = (value.startsWith('/')
                ? value.slice(1)
                : path.posix.normalize(path.posix.join(base, value))
            ).replace(/\/+$/, '');

            if (!tracked.has(resolved) && !dirs.has(resolved)) {
                findings.push({file, target: raw, resolved})
            }
        }
    }

    return {findings, checked, skipped}
}

/** @returns {String[]} every path in the git index */
function trackedFiles() {
    return execFileSync('git', ['ls-files'], {cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024})
        .split('\n')
        .filter(Boolean)
}

function main() {
    const tracked = new Set(trackedFiles()),
          files   = [...tracked].filter(f => f.endsWith('.md') && SCAN_ROOTS.some(r => f.startsWith(r))),
          read    = f => execFileSync('git', ['show', `:${f}`], {cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});

    const {findings, checked, skipped} = collectDeadLinks({files, tracked, read});

    if (findings.length > 0) {
        console.error(`check-relative-links: ${findings.length} unresolved link(s) in ${files.length} file(s).\n`);

        for (const {file, target, resolved} of findings) {
            console.error(`  ${file}`);
            console.error(`      -> ${target}   (resolves to ${resolved}, which the repository does not contain)`)
        }

        console.error('\nA custody move updates the target and leaves the referrer behind. Repoint the link,');
        console.error('or make it a canonical sibling URL when the target now lives in another repository.');

        process.exit(1)
    }

    console.log(
        `check-relative-links: OK — ${checked} path link(s) resolved across ${files.length} file(s) ` +
        `under ${SCAN_ROOTS.join(', ')}; ${skipped} portal ref(s) skipped.`
    )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
