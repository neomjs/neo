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
 * **Fail-to-null discipline:** any read/parse trouble (missing corpus, unreadable file, malformed
 * frontmatter) degrades to an ABSENT count for the affected residents — a missing corpus yields an
 * empty index (every row resolves `null` → no badge), and one unparseable file is skipped rather
 * than zeroing the whole index. The roster assembler must never fail on enricher trouble, and a
 * count is never fabricated: `null` (unknown) and a real integer are the only truths, never a
 * guessed zero. This is the same tri-state honesty the badge contract mandates.
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
 *     — injected in specs so the counting + fail-to-null contract is proven against a fixture tree,
 *     never the live (drifting) corpus.
 * @returns {Map<String, Number>} open-lane count keyed by unprefixed GitHub login; a login ABSENT
 *     from the map has no resolvable count (the assembler stamps `null`, never `0`). Always a Map —
 *     an unreadable corpus yields an empty one, never a throw.
 */
export function resolveOpenLaneCounts({issuesDir = DEFAULT_ISSUES_DIR, fsImpl = fs} = {}) {
    const counts = new Map();

    let relativePaths;

    try {
        if (!fsImpl.existsSync(issuesDir)) {
            return counts
        }

        relativePaths = fsImpl.readdirSync(issuesDir, {recursive: true})
            .filter(entry => typeof entry === 'string' && entry.endsWith('.md'))
    } catch (error) {
        return counts
    }

    for (const relativePath of relativePaths) {
        try {
            const content = fsImpl.readFileSync(path.join(issuesDir, relativePath), 'utf8'),
                  match   = content.match(FRONTMATTER_RE);

            if (!match) {
                continue
            }

            const meta = yaml.load(match[1]);

            if (!meta || meta.state !== 'OPEN' || !Array.isArray(meta.assignees)) {
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
            // One unreadable / unparseable file must never zero the whole index — skip and continue.
        }
    }

    return counts
}
