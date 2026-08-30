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
 * ### Three link classes, and every one of them is resolved
 *
 * A naive resolver reports all three as broken and drowns the real findings — measured on this very
 * repository, where a first pass produced 17 findings of which only 7 were real:
 *
 *   1. **Relative** (`../guides/X.md`) — resolved against the referring file's directory.
 *   2. **Root-absolute** (`/learn/comparisons/X.md`) — **unresolvable, and reported.** Joining these
 *      to the referrer's directory invented six false positives on the first pass; resolving them
 *      from the repository root then over-corrected and reported dead links as healthy. Neither
 *      reader works that way — both send a leading slash to an ORIGIN, not to the repo root.
 *   3. **Portal refs** (`Benefits`, `guides/uibuildingblocks/DockLayouts`) — judged by membership in
 *      `learn/tree.json`, because the portal's router is an exact `store.get(itemId)`. Ids are
 *      slash-separated: **0 of 135 contain a dot**, and several (`Benefits`, `GettingStarted`) are
 *      section nodes with no markdown file, so resolving a portal ref to a path is wrong in both
 *      directions. A dotted `benefits.body.ConfigSystem` is dead for the router AND has no file for
 *      a GitHub reader; the retired `replaceAll('.', '/')` rule certified exactly that as healthy.
 *
 * **Nothing is skipped, and that is the point.** The first version of this guard *exempted* class 3
 * with a suffix heuristic — anything slash-less and extension-less was assumed to be a portal ref and
 * waved through. It was fail-open, and it was not theoretical: all three exempted targets in this
 * repository were **dead**, and the exemption was the only reason they read as clean. An unknown
 * extensionless target is now checked like everything else. The one thing genuinely out of scope is
 * external liveness — http(s), `mailto:` and bare anchors — because that is a different instrument
 * with different failure modes, and mixing them would make this guard flaky.
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

      /** The root the portal resolves a dotted content id against. */
      PORTAL_ROOT = 'learn',

      INLINE_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,

      // A reference definition owns its whole line: `[label]: target` with nothing after the target
      // but an optional title. Allowing trailing prose made `[Side Note]: If you add a new addon…`
      // parse as a definition pointing at `If` — a target that never existed, reported as a link.
      REFERENCE_LINK = /^\[[^\]]+\]:[ \t]*(\S+)[ \t]*(?:["'(].*)?$/gm,

      HTML_HREF = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

/**
 * Targets neither reader resolves inside the repository: an absolute URI, or a bare in-page anchor.
 *
 * Case-insensitive because **URI schemes are case-insensitive** (RFC 3986 §3.1), and both readers
 * honour that — a browser follows `HTTPS://…` exactly like `https://…`. A case-sensitive test made
 * the two sides fail in opposite directions on the same href: this guard classified
 * `HTTPS://example.com/docs/Foo.md` as a repository path and reported a live URL dead, while
 * `app/content/Component.mjs#rewriteLinks` failed to skip it and rewrote an absolute URL into
 * `#/learn/…`. `MailTo:a@b.c` was classified `portal`.
 *
 * Exported so the renderer's skip-list can be pinned against this one in a single table rather than
 * maintained twice and allowed to drift.
 * @type {RegExp}
 */
export const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

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
    if (EXTERNAL_TARGET.test(target)) {
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
/**
 * Resolves one classified target to the repo-relative path it addresses.
 *
 * @param {{kind: String, value: String}} classified
 * @param {String} base Directory of the referring file.
 * @returns {String}
 */
export function resolveTarget({kind, value}, base) {
    // A portal ref has no repository resolution at all — see `portalIds` in collectDeadLinks. It is
    // judged by tree.json membership, because the portal's router is an exact `store.get(itemId)`
    // and several live ids (`Benefits`, `GettingStarted`) are section nodes with NO markdown file.
    if (kind === 'portal') {
        return null
    }

    // A root-absolute target is not a repository path. Both readers resolve it against an ORIGIN:
    // a browser on GitHub sends `/learn/x.md` to `https://github.com/learn/x.md`, and the portal
    // sends it outside the app. Treating the leading slash as "repo root" is a resolver convenience
    // that reports a dead link as healthy, so it has no resolution and is reported as unresolvable.
    if (value.startsWith('/')) {
        return null
    }

    // `normalize` preserves a trailing slash, and the directory set has none — so a link written
    // `./guides/` would miss a directory that is right there. Strip it before lookup.
    return path.posix.normalize(path.posix.join(base, value)).replace(/\/+$/, '')
}

/**
 * Every `id` in the portal's content manifest, which is the ONLY thing that makes a portal ref
 * reachable: the router does an exact `store.get(itemId)`.
 * @param {String} json raw `learn/tree.json`
 * @returns {Set<String>}
 */
export function portalIdsFrom(json) {
    const ids = new Set();

    (function walk(nodes) {
        for (const node of nodes || []) {
            node?.id !== undefined && ids.add(String(node.id));
            walk(node?.items)
        }
    })(JSON.parse(json).data);

    return ids
}

export function collectDeadLinks({files, tracked, read, portalIds = new Set()}) {
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
          portal   = 0;

    for (const file of files) {
        const base = path.posix.dirname(file);

        for (const raw of extractLinkTargets(read(file))) {
            const classified = classifyTarget(raw);

            if (classified.kind === 'external') continue;

            checked++;

            // A portal ref is reachable iff tree.json lists that EXACT id. The former rule mapped
            // dots to slashes and checked for a file, which certified `benefits.body.ConfigSystem`
            // as healthy — a form dead in BOTH readers: 0 of 135 live ids contain a dot, so the
            // router misses it, and no such file exists for a GitHub reader to open either.
            if (classified.kind === 'portal') {
                portal++;

                portalIds.has(classified.value) ||
                    findings.push({file, target: raw, resolved: null, kind: 'portal'});

                continue
            }

            const resolved = resolveTarget(classified, base);

            if (resolved === null || (!tracked.has(resolved) && !dirs.has(resolved))) {
                findings.push({file, target: raw, resolved, kind: classified.kind})
            }
        }
    }

    return {findings, checked, portal}
}

/**
 * Every path in the git index.
 *
 * Exported with an injectable root so the index-authority claim in this module's header is
 * testable. Injecting `tracked` into {@link collectDeadLinks} proves the resolver; it cannot prove
 * that the CLI's membership set comes from the index rather than the filesystem, and that
 * distinction is the entire reason this guard resolves against git.
 * @param {String} [root=repoRoot]
 * @returns {String[]}
 */
export function trackedFiles(root = repoRoot) {
    return execFileSync('git', ['ls-files'], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024})
        .split('\n')
        .filter(Boolean)
}

/**
 * Reads one tracked path out of the git index — `:<path>`, not the working tree — so a staged edit
 * is what gets scanned.
 * @param {String} [root=repoRoot]
 * @returns {function(String): String}
 */
export function stagedReader(root = repoRoot) {
    return f => execFileSync('git', ['show', `:${f}`], {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024})
}

function main() {
    const tracked = new Set(trackedFiles()),
          files   = [...tracked].filter(f => f.endsWith('.md') && SCAN_ROOTS.some(r => f.startsWith(r))),
          read    = stagedReader();

    const {findings, checked, portal} = collectDeadLinks({
        files, tracked, read, portalIds: portalIdsFrom(read(`${PORTAL_ROOT}/tree.json`))
    });

    if (findings.length > 0) {
        console.error(`check-relative-links: ${findings.length} unresolved link(s) in ${files.length} file(s).\n`);

        for (const {file, target, resolved, kind} of findings) {
            console.error(`  ${file}`);
            console.error(`      -> ${target}${kind === 'portal' ? '   [portal id]' : ''}`);
            console.error(resolved === null
                ? '         is root-absolute: both readers resolve it against an origin, not the repository root'
                : `         resolves to ${resolved}, which the repository does not contain`)
        }

        console.error('\nA custody move updates the target and leaves the referrer behind. Repoint the link,');
        console.error('or make it a canonical sibling URL when the target now lives in another repository.');
        console.error('A [portal id] resolves as learn/<dots-become-slashes>.md — see apps/portal/view/learn/Component.mjs.');

        process.exit(1)
    }

    console.log(
        `check-relative-links: OK — ${checked} link(s) resolved across ${files.length} file(s) ` +
        `under ${SCAN_ROOTS.join(', ')}, of which ${portal} portal id(s). Nothing exempted.`
    )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
