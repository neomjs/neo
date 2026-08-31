#!/usr/bin/env node
/**
 * @module buildScripts/util/check-relative-links
 * @summary Fails loud when a scanned markdown file links to a path the repository does not contain.
 * Custody decisions move targets; nothing moved the referrers, and until this guard existed nothing
 * could see the difference.
 *
 * ### Two corpora, one resolver
 *
 * `learn/**` is the guide corpus. The **entry docs** — every root-level `*.md` plus `.github/**` —
 * are what a newcomer and an agent operator read first, and they were outside this guard until a
 * community contributor was handed a `CONTRIBUTING.md` pointing at two files the split had moved.
 * They share the resolver and differ in two rules, both of which are properties of the corpus
 * rather than of the link:
 *
 *   - **Portal refs exist only under `learn/**`.** A slash-less, suffix-less target is a portal id
 *     there and a plain path everywhere else. Judging `LICENSE` in a README against `learn/tree.json`
 *     would report a live file dead, so `allowPortal` is off outside the guide corpus.
 *   - **A target that climbs above the repository root is GitHub tab navigation.** `../../issues` in
 *     `CONTRIBUTING.md` is not a broken path; GitHub resolves a relative link against the blob URL,
 *     so climbing two levels off `/<owner>/<repo>/blob/<ref>/` lands on `/<owner>/<repo>/issues`. It
 *     is excluded by rule and **counted in the summary line** — an exclusion nobody can see is how a
 *     guard goes quietly fail-open.
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

      /** The guide corpus: the only place a portal ref is meaningful. */
      PORTAL_SCOPE = 'learn/',

      /**
       * Directory prefixes whose markdown files are scanned. Root-level `*.md` files are added by
       * {@link scanTargets} as a rule rather than a list, so a new entry doc is covered the day it
       * lands instead of the day someone remembers to enumerate it.
       */
      SCAN_ROOTS = ['learn/', '.github/'],

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
 *
 * `allowPortal` is a property of the **corpus**, not of the link. Under `learn/**` a slash-less,
 * suffix-less target is a portal id, judged against `learn/tree.json`. In an entry doc the same
 * shape is an ordinary path — `<a href="LICENSE">` — and checking it against the portal manifest
 * reports a tracked file dead. Widening the scan set without this flag would plant that trap rather
 * than trip it: the entry docs contain zero portal-shaped targets today, so nothing would have
 * caught it.
 * @param {String}  target
 * @param {Object}  [options]
 * @param {Boolean} [options.allowPortal=true]
 * @returns {{kind: 'external'|'portal'|'path', value: String}}
 */
export function classifyTarget(target, {allowPortal = true} = {}) {
    if (EXTERNAL_TARGET.test(target)) {
        return {kind: 'external', value: target}
    }

    // strip the fragment and query — `X.md#section` addresses the same file
    const value = target.split('#')[0].split('?')[0].trim();

    if (!value) {
        return {kind: 'external', value: target}
    }

    // Lower-cased for the same reason the scheme test is case-insensitive: `Foo.MD` is one file on
    // every system this corpus is read on, and a case-sensitive suffix test classified it `portal`
    // — then judged a markdown file against tree.json membership and reported it dead.
    const lower = value.toLowerCase();

    if (allowPortal && !value.includes('/') && !FILE_SUFFIXES.some(suffix => lower.endsWith(suffix))) {
        return {kind: 'portal', value}
    }

    return {kind: 'path', value}
}

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
 * The repository tabs GitHub serves directly under `/<owner>/<repo>/`.
 *
 * The list IS the exemption: anything escaping the tree that is not one of these is a broken path,
 * not navigation, and must be reported.
 * @type {Set<String>}
 */
export const REPO_TAB_SEGMENTS = new Set([
    'actions', 'branches', 'commits', 'discussions', 'graphs', 'issues', 'labels', 'milestones',
    'network', 'projects', 'pulls', 'pulse', 'releases', 'security', 'tags', 'wiki'
]);

/**
 * Names the repository tab a resolved target addresses, or `null` when it addresses none.
 *
 * GitHub renders a relative link against the blob URL, so `../../issues` in a root-level document
 * resolves to `/<owner>/<repo>/issues` — the issues tab, which is what the author meant.
 *
 * **Climbing out of the tree is not by itself permission to be exempt.** The first version of this
 * rule tested `resolved.startsWith('..')`, which is a *shape*, not a destination: it also waved
 * through `../../GONE.md`, a genuinely dead path, and `..hidden`, a filename that never climbed
 * anywhere. Counting an exemption makes it visible; it does not make it correct, and a counter on a
 * predicate broader than the class it names is fail-open while looking measured.
 * @param {String|null} resolved
 * @returns {String|null}
 */
export function repoTabTarget(resolved) {
    if (typeof resolved !== 'string' || !resolved.startsWith('../')) {
        return null
    }

    const rest = resolved.replace(/^(?:\.\.\/)+/, '');

    // A remainder that still climbs, or none at all, addresses nothing nameable.
    if (!rest || rest.startsWith('..')) {
        return null
    }

    return REPO_TAB_SEGMENTS.has(rest.split('/')[0]) ? rest.split('/')[0] : null
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

/**
 * Why one finding failed, in the author's terms.
 *
 * Branches on KIND, not on `resolved === null`. Portal findings are unresolved by construction, so
 * a null test described every dead id as root-absolute — and the CLI footer then told the author to
 * spell it with dots, the exact rule this guard stopped honouring. **A guard whose remedy text is
 * wrong teaches the repair that caused the finding**, which is worse than saying nothing. Exported
 * so the prose is pinned by a spec rather than only reachable by running the binary.
 * @param {Object}      finding
 * @param {String}      finding.kind
 * @param {String|null} finding.resolved
 * @returns {String}
 */
export function describeFinding({kind, resolved}) {
    if (kind === 'portal') {
        return 'is not an id in learn/tree.json, which is the only thing the router resolves'
    }

    return resolved === null
        ? 'is root-absolute: both readers resolve it against an origin, not the repository root'
        : `resolves to ${resolved}, which the repository does not contain`
}

/**
 * The markdown files this guard scans: everything under {@link SCAN_ROOTS}, plus every root-level
 * `*.md`.
 *
 * Root docs are selected by a rule — no slash in the path — rather than an enumerated list. An
 * enumeration decays silently: the next entry doc someone adds is unguarded until a human notices,
 * which is the same trigger-starvation that left the entry docs unwatched to begin with.
 * @param {Iterable<String>} tracked
 * @returns {String[]}
 */
export function scanTargets(tracked) {
    return [...tracked].filter(f =>
        f.endsWith('.md') && (SCAN_ROOTS.some(root => f.startsWith(root)) || !f.includes('/')))
}

/**
 * Resolves every path-shaped link in `files` and reports the ones the tracked set does not contain.
 *
 * @param {Object}        options
 * @param {String[]}      options.files Repo-relative markdown paths to scan.
 * @param {Set<String>}   options.tracked Every repo-relative path git knows about.
 * @param {Function}      options.read `(repoRelativePath) => String`
 * @param {Set<String>}   [options.portalIds] Every id in `learn/tree.json`; an empty set reports
 *     every portal ref dead, which is correct for a corpus that has no manifest.
 * @returns {{findings: Object[], checked: Number, portal: Number, navigation: Number}}
 *     `checked` counts every non-external target considered; `portal` and `navigation` are the two
 *     classes resolved by rule rather than by path, reported so neither can be silently broad.
 */
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
    let   checked    = 0,
          portal     = 0,
          navigation = 0;

    for (const file of files) {
        const base        = path.posix.dirname(file),
              allowPortal = file.startsWith(PORTAL_SCOPE);

        for (const raw of extractLinkTargets(read(file))) {
            const classified = classifyTarget(raw, {allowPortal});

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

            // Counted, never silent. An exclusion the summary does not name is indistinguishable
            // from coverage — and an exclusion broader than the class it names is fail-open even
            // while it is being counted, which is exactly what `startsWith('..')` was.
            if (repoTabTarget(resolved)) {
                navigation++;
                continue
            }

            if (resolved === null || (!tracked.has(resolved) && !dirs.has(resolved))) {
                findings.push({file, target: raw, resolved, kind: classified.kind})
            }
        }
    }

    return {findings, checked, portal, navigation}
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

/**
 * The whole audit, composed exactly once.
 *
 * The CLI and the spec both call THIS. Previously `main()` did its own selection, reading and
 * collection while the spec exercised the three helpers in separate arms — so restoring `main()` to
 * the former `learn/**`-only selector left every test green. Helper arms prove the helpers; only a
 * shared composition proves the thing production runs.
 * @param {String} [root=repoRoot] Repository to audit; injectable so a spec can seed a real index.
 * @returns {{findings: Object[], checked: Number, portal: Number, navigation: Number, files: String[]}}
 */
export function runAudit(root = repoRoot) {
    const tracked = new Set(trackedFiles(root)),
          files   = scanTargets(tracked),
          read    = stagedReader(root),
          // A seeded repository has no portal manifest, and absence must not be silently treated as
          // "every portal ref is fine" — an empty set reports them, which is the honest default.
          portalIds = tracked.has(`${PORTAL_ROOT}/tree.json`)
              ? portalIdsFrom(read(`${PORTAL_ROOT}/tree.json`))
              : new Set();

    return {files, ...collectDeadLinks({files, tracked, read, portalIds})}
}

function main() {
    const {files, findings, checked, portal, navigation} = runAudit();

    if (findings.length > 0) {
        console.error(`check-relative-links: ${findings.length} unresolved link(s) in ${files.length} file(s).\n`);

        for (const {file, target, resolved, kind} of findings) {
            console.error(`  ${file}`);
            console.error(`      -> ${target}${kind === 'portal' ? '   [portal id]' : ''}`);

            console.error(`         ${describeFinding({kind, resolved})}`)
        }

        console.error('\nA custody move updates the target and leaves the referrer behind. Repoint the link,');
        console.error('or make it a canonical sibling URL when the target now lives in another repository.');
        console.error('A [portal id] must match a learn/tree.json id EXACTLY — ids are slash-separated and the');
        console.error('router does a plain store.get, so a dotted spelling never resolves. Relative .md links are');
        console.error('rewritten for you by app/content/Component.mjs#rewriteLinks; prefer them.');

        process.exit(1)
    }

    console.log(
        `check-relative-links: OK — ${checked} link(s) resolved across ${files.length} file(s) ` +
        `under ${SCAN_ROOTS.join(', ')} and the root entry docs, of which ${portal} portal id(s) ` +
        `and ${navigation} repo-tab link(s) such as ../../issues. Nothing else exempted.`
    )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
