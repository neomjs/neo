import fs              from 'fs';
import path            from 'path';
import * as yaml       from 'js-yaml';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @module ai/services/fleet/resolveOpenLaneCounts
 * @summary Brain-side enricher that stamps the fleet-roster DTO's `openLaneCount` producer seam:
 * counts each resident's OPEN assigned issues from the local synced issues corpus, so the FM
 * cockpit's AgentCard lane-count badge renders live density instead of the honest-but-empty `null`
 * every row otherwise carries. It is the producer successor to the shipped consumer badge — the
 * roster DTO owns `openLaneCount` end-to-end (assembler stamp → cockpit record → card badge).
 *
 * **Source (local synced issues corpus, recorded on the lane ticket at claim):** reads the markdown
 * mirror under `resources/content/issues/` (frontmatter `state` + `assignees`), the same substrate
 * the graph ingestor consumes. Zero API cost and no rate-limit coupling; freshness is the sync
 * pipeline's cadence, which matches the roster's own poll class. The live-`gh`-query alternative was
 * rejected as poll-frequency-coupled over-engineering.
 *
 * **Active tier only:** OPEN issues live exclusively in the active tier — the archive tier holds
 * only sealed CLOSED items — so a recursive scan of `resources/content/issues/` (per the content
 * architecture's consumer-recursion rule) is both sufficient and correct; the archive is never
 * walked.
 *
 * **Completeness channel (the DTO's `integer >= 0 | null` truth contract):** the resolver returns
 * `{counts, complete}`, not a bare map — `complete` is what lets the assembler tell a proven `0`
 * apart from an unknown. `complete: true` requires the dir to exist, the listing to succeed, AND every
 * issue file to parse cleanly; then a known resident absent from `counts` is a proven `0` (the scan
 * saw everything and found nothing open). `complete: false` (missing corpus, unreadable listing, or
 * ANY unparseable issue file) means no count is trustworthy → the assembler stamps `null` for EVERY
 * resident. A parse failure cannot reveal WHICH assignee it would have counted, so it taints the WHOLE
 * scan rather than silently publishing a plausible under-count — never a fabricated `0`, never an
 * unproven integer. The roster assembler must never fail on enricher trouble (a resolver throw is the
 * incomplete case). This is the tri-state honesty the badge contract mandates.
 *
 * **Synchronous by design:** the assembler verb (`FleetControlBridge.fleetRoster`) is synchronous
 * and this is a low-frequency, human-facing roster poll, so one synchronous corpus scan per assembly
 * keeps the verb's contract unchanged with no async ripple. If a tighter poll cadence ever makes the
 * per-poll scan measurable, a short-TTL memoization is the isolated follow-up — not a reason to
 * couple the assembler to the live API.
 */

/**
 * Default active-tier issues corpus root, resolved relative to this module — the same
 * module-relative resolution the graph ingestor uses for the identical substrate. Injectable via the
 * `issuesDir` option so unit specs run hermetically against a fixture tree.
 * @type {String}
 */
const DEFAULT_ISSUES_DIR = path.resolve(__dirname, '../../../resources/content/issues');

/**
 * Leading YAML frontmatter fence matcher — the same `^---\n…\n---` block the graph ingestor parses.
 * The lazy body stops at the first closing fence, so the match is cheap even on a long issue body.
 * @type {RegExp}
 */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/**
 * @summary Count each resident's OPEN assigned lanes from the local synced issues corpus.
 * @param {Object} [options={}]
 * @param {String} [options.issuesDir=DEFAULT_ISSUES_DIR] Active-tier issues corpus root to scan.
 * @param {Object} [options.fsImpl=fs] Filesystem seam (`existsSync` / `readdirSync` / `readFileSync`)
 *     — injected in specs so the counting + completeness contract is proven against a fixture tree,
 *     never the live (drifting) corpus.
 * @returns {{counts: Map<String, Number>, complete: Boolean}} `counts` = open-lane count keyed by
 *     unprefixed GitHub login (only residents with ≥1 open assigned lane appear). `complete` = whether
 *     the WHOLE corpus scan succeeded: `true` only when the dir existed, the listing succeeded, and
 *     EVERY issue file parsed cleanly. The completeness channel is what preserves the DTO's
 *     `integer >= 0 | null` truth contract at the stamp site: on `complete`, a known resident ABSENT
 *     from `counts` is a proven `0` (nothing open); on `!complete`, no count is trustworthy so every
 *     resident stamps `null` (unknown). A parse failure cannot reveal WHICH assignee it would have
 *     counted, so it taints the whole scan rather than silently publishing an under-count.
 */
export function resolveOpenLaneCounts({issuesDir = DEFAULT_ISSUES_DIR, fsImpl = fs} = {}) {
    const counts = new Map();

    let relativePaths;

    try {
        if (!fsImpl.existsSync(issuesDir)) {
            return {counts, complete: false} // source unavailable → unknown, never a fabricated zero
        }

        relativePaths = fsImpl.readdirSync(issuesDir, {recursive: true})
            .filter(entry => typeof entry === 'string' && entry.endsWith('.md') && path.basename(entry).startsWith('issue-'))
    } catch (error) {
        return {counts, complete: false} // corpus listing unreadable → unknown
    }

    // COMPLETE only if every issue file parses cleanly. A parse failure (unreadable file, missing
    // frontmatter fence, unusable frontmatter) cannot reveal WHICH assignee it would have counted, so it
    // taints the WHOLE scan → the assembler stamps `null` for everyone rather than publish a plausible
    // under-count. A cleanly-parsed CLOSED / no-assignees issue contributes nothing but does NOT taint
    // (it was read successfully; it is simply not an open assigned lane).
    let complete = true;

    for (const relativePath of relativePaths) {
        try {
            const content = fsImpl.readFileSync(path.join(issuesDir, relativePath), 'utf8'),
                  match   = content.match(FRONTMATTER_RE);

            if (!match) {
                complete = false; // an issue file with no frontmatter fence is corrupt → completeness lost
                continue
            }

            const meta = parsedMeta(match); // throws on malformed YAML → caught below → completeness lost

            if (typeof meta === 'undefined') {
                complete = false; // present-but-unusable frontmatter → cannot classify this file
                continue
            }

            if (meta.state !== 'OPEN') {
                continue // cleanly-parsed non-OPEN issue → contributes nothing, no taint
            }

            // OPEN issue: an absent / empty (`null`) assignees field is genuinely unassigned (no taint); but an
            // assignees value that is PRESENT and not an array is valid YAML of an INVALID shape — it can hide a
            // resident, so it must taint completeness rather than clean-skip (the false-zero / under-count hole).
            if (meta.assignees === undefined || meta.assignees === null) {
                continue
            }

            if (!Array.isArray(meta.assignees)) {
                complete = false;
                continue
            }

            for (const assignee of meta.assignees) {
                // corpus assignees are unprefixed GitHub logins — the same key space as the roster's
                // `githubUsername`; no prefix normalization is needed (or possible: an `@`-leading
                // plain scalar is a reserved-indicator YAML error and never reaches here).
                if (typeof assignee === 'string' && assignee.length > 0) {
                    counts.set(assignee, (counts.get(assignee) ?? 0) + 1)
                }
            }
        } catch (error) {
            complete = false // an unreadable / unparseable issue → the scan can no longer prove any count
        }
    }

    return {counts, complete}
}

/**
 * @summary Parse the frontmatter block into a plain object, or `undefined` when it is unusable (empty /
 * non-object / a top-level array). A top-level array or scalar is valid YAML but an INVALID record shape
 * — it cannot carry `state`/`assignees`, so it is unusable and the caller treats it as a
 * completeness-tainting parse failure (not a silent skip). A malformed YAML body throws here and is
 * caught by the caller.
 * @param {String[]} match The `FRONTMATTER_RE` match (`match[1]` = the YAML body).
 * @returns {Object|undefined}
 */
function parsedMeta(match) {
    const meta = yaml.load(match[1]);

    return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : undefined
}
