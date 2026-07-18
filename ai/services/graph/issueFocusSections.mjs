import fs                                    from 'fs';
import matter                                from 'gray-matter';
import path                                  from 'path';
import {Memory_Config as aiConfig}           from '../../services.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import logger                                from '../../mcp/server/memory-core/logger.mjs';
import {IDENTITIES}                          from '../../graph/identityRoots.mjs';

/**
 * @module ai/services/graph/issueFocusSections
 */

const DAY_MS                  = 24 * 60 * 60 * 1000;
const CURRENT_FOCUS_WINDOW_MS = 3 * DAY_MS;
const EPIC_LABEL              = 'epic';
const STALL_FINDING_TTL_MS    = 7 * DAY_MS;
const escapeRegExp            = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PR_PARKED_ON_PATTERN    = /^Parked-on:\s*(#[0-9]+|https?:\/\/\S+)(?:\s+\[([^\]]+)\])?\s+[-\u2013\u2014]\s+(.+)$/im;

const CURRENT_FOCUS_EXCLUDED_LABELS = Object.freeze(new Set([
    'deferred-by-design',
    'duplicate',
    'epic',
    'invalid',
    'needs-design',
    'needs-re-triage',
    'not-code-ready',
    'not code ready',
    'wontfix',
    'wont fix'
]));

// The current-release version is matched dynamically at the use site (read from AiConfig), so a
// shipped release never lingers here as a hardcoded epic-focus reason.
const EPIC_CURRENT_FOCUS_REASONS = Object.freeze(new Set([
    'incident',
    'prio-zero'
]));

const DEFER_LABELS = Object.freeze(new Set([
    'deferred-by-design',
    'needs-design',
    'needs-re-triage',
    'not-code-ready',
    'not code ready'
]));

const INACTIVE_PARTICIPATION_STATUSES = Object.freeze(new Set([
    'operator_benched',
    'temporarily_unreachable'
]));

const MAINTAINER_PROGRESS_PATTERN = /\b(?:in[-\s]?progress|picking up|taking|claim(?:ed|ing)?|lane-claim|lane-state:\s*next-lane|working|implement(?:ing)?|opened\s+(?:PR|pull request)|PR\s*#\d+)\b/i;

/**
 * @summary Normalizes an `identityRoots.mjs` GitHub login for local issue payload matching.
 *
 * @param {Object} identity AgentIdentity root entry.
 * @returns {String|null} Bare GitHub login, or `null` when unavailable.
 */
function getIdentityGithubLogin(identity) {
    const login = identity.properties?.githubLogin;

    return typeof login === 'string' && login ? login.replace(/^@/, '') : null
}

/**
 * @summary Returns maintainer logins eligible for stale-assignment progress acknowledgements.
 *
 * Stale-assignment acknowledgements consume the AgentIdentity registry and include
 * human owner identities. Assignee comments still qualify independently in
 * `findLastQualifyingAssignmentActivity`.
 *
 * @returns {String[]} Maintainer logins without leading `@`.
 */
export function getStaleAssignmentMaintainers() {
    return [...new Set(
        IDENTITIES
            .filter(identity =>
                identity.type === 'AgentIdentity' &&
                ['agent', 'human'].includes(identity.properties?.accountType) &&
                identity.properties?.githubLogin
            )
            .map(identity => getIdentityGithubLogin(identity))
            .filter(Boolean)
    )]
}

/**
 * @summary Returns AgentIdentity participation state keyed by GitHub login.
 *
 * Stall inference consumes the same structured participation ledger as
 * family-keyed quorum. It does not infer absence from message recency or raw
 * issue timestamps.
 *
 * @param {Object[]} identities AgentIdentity roots.
 * @returns {Map<String, Object>} Login without leading `@` to identity metadata.
 */
export function getParticipationStatusByLogin(identities = IDENTITIES) {
    const statusByLogin = new Map();

    for (const identity of identities) {
        const login = getIdentityGithubLogin(identity);
        if (!login) continue;

        statusByLogin.set(login, {
            authority          : identity.properties?.authority || null,
            identityId         : identity.id,
            login,
            participationStatus: identity.properties?.participationStatus || 'unknown',
            reactivationTrigger: identity.properties?.reactivationTrigger || null,
            since              : identity.properties?.since || null,
            statusReason       : identity.properties?.statusReason || null
        });
    }

    return statusByLogin
}

/**
 * @summary Converts arbitrary dates into stable ISO strings for finding payloads.
 * @param {*} value Candidate date.
 * @param {Date} fallback Fallback date.
 * @returns {String}
 */
function toIsoString(value, fallback = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();

    const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback);
    return fallbackDate.toISOString()
}

/**
 * @summary Extracts a canonical issue id from synced issue frontmatter.
 * @param {Object} meta Parsed frontmatter.
 * @param {String} filePath Markdown source path.
 * @returns {String}
 */
function getIssueId(meta = {}, filePath = '') {
    const rawId = meta.id || meta.number || path.basename(filePath, '.md').replace(/^issue-/, '');

    return String(rawId).startsWith('issue-') ? String(rawId) : `issue-${rawId}`
}

/**
 * @summary Extracts the numeric issue number where possible.
 * @param {Object} meta Parsed frontmatter.
 * @param {String} issueId Canonical issue id.
 * @returns {Number|String}
 */
function getIssueNumber(meta = {}, issueId = '') {
    const raw = meta.id || meta.number || String(issueId).replace(/^issue-/, '');
    return Number(raw) || raw
}

/**
 * @summary Collects local issue markdown files from the ordinal content tree.
 *
 * The GitHub content sync stores active issues in chunk directories under
 * `resources/content/issues/`. This recursive helper keeps Golden Path
 * enrichment compatible with the ordinal-100 content architecture without
 * coupling stale-assignment logic to a single chunk layout.
 *
 * @param {String} rootDir Directory containing synced issue markdown files.
 * @returns {String[]} Absolute markdown file paths sorted lexically for deterministic output.
 */
export function collectIssueMarkdownFiles(rootDir) {
    const files = [];

    function visit(dir) {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const entryPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                visit(entryPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(entryPath);
            }
        }
    }

    visit(rootDir);

    return files.sort()
}

/**
 * @summary Extracts GitHub issue comment blocks from synced issue markdown.
 *
 * IssueSyncer renders comments as `### @user - timestamp` blocks. Regex is
 * intentionally scoped to that stable serialized timeline shape; frontmatter is
 * parsed separately through `gray-matter`.
 *
 * @param {String} content Markdown body without frontmatter.
 * @returns {Array<{author: String, createdAt: String, body: String}>}
 */
export function extractIssueCommentBlocks(content) {
    const comments     = [];
    const commentRegex = /^### @([^\s]+) - ([^\n]+)\n\n([\s\S]*?)(?=^### @|^- \d{4}-\d{2}-\d{2}T|\n## |\s*$)/gm;
    let match;

    while ((match = commentRegex.exec(content)) !== null) {
        comments.push({
            author   : match[1],
            createdAt: match[2].trim(),
            body     : match[3].trim()
        });
    }

    return comments
}

/**
 * @summary Extracts assignment events for the currently assigned issue owners.
 *
 * Assignment events provide the conservative clock-start when no assignee or
 * maintainer comment exists yet. They are not a substitute for the 7-day
 * qualifying-activity rule; they only prevent missing-comment timelines from
 * producing `unknown` last-activity rows.
 *
 * @param {String} content Markdown body without frontmatter.
 * @param {String[]} assignees Current assignee logins.
 * @returns {Array<{author: String, createdAt: String, assignee: String}>}
 */
export function extractAssignmentEvents(content, assignees = []) {
    const assigneeSet     = new Set(assignees);
    const events          = [];
    const assignmentRegex = /^- (\d{4}-\d{2}-\d{2}T[^\s]+) @([^\s]+) assigned to @([^\s]+)/gm;
    let match;

    while ((match = assignmentRegex.exec(content)) !== null) {
        if (assigneeSet.has(match[3])) {
            events.push({
                createdAt: match[1],
                author   : match[2],
                assignee : match[3]
            });
        }
    }

    return events
}

/**
 * @summary Finds the last activity that satisfies the ticket-intake 7-day reassignment rule.
 *
 * Qualifying activity is an assignee comment or a maintainer progress
 * acknowledgement. Assignment events and issue creation are conservative
 * fallbacks for otherwise silent issues.
 *
 * @param {Object} issue Parsed issue record.
 * @param {String[]} issue.assignees Current assignee logins.
 * @param {String} issue.createdAt Issue creation timestamp.
 * @param {String} issue.content Markdown body without frontmatter.
 * @param {String[]} [maintainers=getStaleAssignmentMaintainers()] Maintainer logins.
 * @returns {{createdAt: Date, author: String, reason: String}}
 */
export function findLastQualifyingAssignmentActivity(issue, maintainers = getStaleAssignmentMaintainers()) {
    const assigneeSet   = new Set(issue.assignees || []);
    const maintainerSet = new Set(maintainers);
    const candidates    = [];

    for (const comment of extractIssueCommentBlocks(issue.content || '')) {
        const createdAt = new Date(comment.createdAt);
        if (Number.isNaN(createdAt.getTime())) continue;

        if (assigneeSet.has(comment.author)) {
            candidates.push({createdAt, author: comment.author, reason: 'assignee-comment'});
        } else if (maintainerSet.has(comment.author) && MAINTAINER_PROGRESS_PATTERN.test(comment.body)) {
            candidates.push({createdAt, author: comment.author, reason: 'maintainer-progress-ack'});
        }
    }

    for (const event of extractAssignmentEvents(issue.content || '', issue.assignees || [])) {
        const createdAt = new Date(event.createdAt);
        if (!Number.isNaN(createdAt.getTime())) {
            candidates.push({createdAt, author: event.author, reason: `assignment:${event.assignee}`});
        }
    }

    const createdAt = new Date(issue.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
        candidates.push({createdAt, author: issue.author || 'unknown', reason: 'issue-created'});
    }

    candidates.sort((a, b) => b.createdAt - a.createdAt);

    return candidates[0] || null
}

/**
 * @summary Builds stale-assignment candidates from local synced issue markdown.
 *
 * @param {Object} options
 * @param {String} options.issuesDir Local synced issue directory.
 * @param {Date} [options.now=new Date()] Current clock for deterministic tests.
 * @param {Number} [options.thresholdMs=aiConfig.goldenPathStaleAssignmentThresholdMs] Stale threshold.
 * @param {String[]} [options.maintainers=getStaleAssignmentMaintainers()] Maintainer logins.
 * @returns {Array<Object>} Stale candidates sorted by oldest qualifying activity first.
 */
export function buildStaleAssignmentCandidates({
    issuesDir,
    now = new Date(),
    thresholdMs = aiConfig.goldenPathStaleAssignmentThresholdMs,
    maintainers = getStaleAssignmentMaintainers()
}) {
    const candidates = [];
    const nowDate    = now instanceof Date ? now : new Date(now);

    for (const filePath of collectIssueMarkdownFiles(issuesDir)) {
        let parsed;
        try {
            parsed = matter(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            logger.warn(`[GoldenPathSynthesizer] Failed to parse issue markdown for stale-assignment detector: ${filePath}`, error);
            continue;
        }

        const meta      = parsed.data || {};
        const labels    = Array.isArray(meta.labels) ? meta.labels : [];
        const assignees = Array.isArray(meta.assignees) ? meta.assignees.filter(Boolean) : [];

        if (meta.state !== 'OPEN' ||
            assignees.length === 0 ||
            labels.includes('needs-re-triage')) {
            continue;
        }

        const lastActivity = findLastQualifyingAssignmentActivity({
            assignees,
            author   : meta.author,
            content  : parsed.content,
            createdAt: meta.createdAt
        }, maintainers);

        if (!lastActivity) continue;

        const idleMs = nowDate - lastActivity.createdAt;
        if (idleMs >= thresholdMs) {
            candidates.push({
                assignees,
                daysIdle      : Math.floor(idleMs / DAY_MS),
                filePath,
                lastActivityAt: lastActivity.createdAt.toISOString(),
                lastActivityBy: lastActivity.author,
                number        : meta.id,
                reason        : lastActivity.reason,
                title         : meta.title || '(no title)',
                url           : meta.githubUrl
            });
        }
    }

    candidates.sort((a, b) => new Date(a.lastActivityAt) - new Date(b.lastActivityAt));

    return candidates
}

/**
 * @summary Renders the Sandman handoff stale-assignment section.
 *
 * @param {Array<Object>} candidates Stale assignment candidates.
 * @param {Object} options
 * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
 * @param {Number} [options.limit=aiConfig.goldenPathStaleAssignmentRenderLimit] Maximum candidates to render.
 * @returns {String}
 */
export function renderStaleAssignmentCandidatesSection(candidates, {
    capturedAt = new Date(),
    limit = aiConfig.goldenPathStaleAssignmentRenderLimit
} = {}) {
    let section = `\n## Stale Assignment Candidates\n\n`;
    section += `*Captured at: ${capturedAt.toISOString()} (Source: local issue sync)*\n\n`;

    if (candidates.length === 0) {
        section += `No stale assignment candidates detected.\n`;
        return section
    }

    const visibleCandidates = candidates.slice(0, limit);

    if (candidates.length > visibleCandidates.length) {
        section += `Showing ${visibleCandidates.length} of ${candidates.length} candidates, sorted oldest qualifying activity first.\n\n`;
    }

    for (const candidate of visibleCandidates) {
        const assignees = candidate.assignees.map(assignee => `@${assignee}`).join(', ');
        const issueRef  = `#${candidate.number}`;
        section += `- **${issueRef}** — ${candidate.title} — assignee ${assignees} — last qualifying activity ${candidate.lastActivityAt} by @${candidate.lastActivityBy} (${candidate.daysIdle} days ago; ${candidate.reason})\n`;
    }

    return section
}

/**
 * @summary Finds the latest reliable activity timestamp for an open issue.
 *
 * Silent Threads deliberately uses deterministic sync metadata rather than LLM triage:
 * `updatedAt` first, then parsed timeline comments, then `createdAt` as the fallback.
 *
 * @param {Object} issue Parsed issue record.
 * @param {String} issue.content Markdown body without frontmatter.
 * @param {String} issue.createdAt Issue creation timestamp.
 * @param {String} issue.updatedAt Issue update timestamp.
 * @returns {{createdAt: Date, author: String, reason: String}|null}
 */
export function findLatestIssueActivity(issue) {
    const candidates = [];

    const updatedAt = new Date(issue.updatedAt);
    if (!Number.isNaN(updatedAt.getTime())) {
        candidates.push({createdAt: updatedAt, author: 'github-sync', reason: 'updatedAt'});
    }

    for (const comment of extractIssueCommentBlocks(issue.content || '')) {
        const createdAt = new Date(comment.createdAt);
        if (!Number.isNaN(createdAt.getTime())) {
            candidates.push({createdAt, author: comment.author, reason: 'comment'});
        }
    }

    const createdAt = new Date(issue.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
        candidates.push({createdAt, author: issue.author || 'unknown', reason: 'issue-created'});
    }

    candidates.sort((a, b) => b.createdAt - a.createdAt);

    return candidates[0] || null
}

/**
 * @summary Returns the Golden Path-style structural weight for an issue node.
 *
 * Uses the same inbound non-BLOCKS edge-weight shape as computed Golden Path scoring.
 * Missing graph storage degrades to zero; Silent Threads then falls back to pure age.
 *
 * @param {String} issueId Canonical graph issue id (`issue-N`).
 * @param {Object} [graphService=GraphService] Memory GraphService singleton or test double.
 * @returns {Number}
 */
export function getIssueStructuralWeight(issueId, graphService = GraphService) {
    try {
        const sqliteDb = graphService?.db?.storage?.db;
        if (!sqliteDb) return 0;

        const row = sqliteDb.prepare(`
            SELECT COALESCE(SUM(json_extract(e.data, '$.properties.weight')), 0.0) AS structuralWeight
            FROM Edges e
            WHERE e.target = ? AND e.type != 'BLOCKS'
        `).get(issueId);

        return Number(row?.structuralWeight || 0)
    } catch (error) {
        return 0
    }
}

/**
 * @summary Determines whether an issue has an open blocker.
 *
 * Prefer graph topology when available. If graph topology is not mounted, fall back to
 * synced frontmatter `blockedBy` so a visibility-only signal does not resurface known
 * blocked work.
 *
 * @param {Object} options
 * @param {String} options.issueId Canonical graph issue id (`issue-N`).
 * @param {Object} options.issue Parsed issue frontmatter.
 * @param {Object} [options.graphService=GraphService] Memory GraphService singleton or test double.
 * @returns {Boolean}
 */
export function hasOpenIssueBlocker({issueId, issue, graphService = GraphService}) {
    let graphChecked = false;

    try {
        if (graphService?.db?.edges?.getByIndex) {
            graphChecked = true;
            graphService.db.getAdjacentNodes?.(issueId, 'both');

            const blockers = graphService.db.edges.getByIndex('target', issueId).filter(edge => edge.type === 'BLOCKS');
            for (const edge of blockers) {
                const blockerNode = graphService.db.nodes?.get?.(edge.source);
                if (blockerNode && (blockerNode.properties?.state === 'OPEN' || blockerNode.state === 'OPEN')) {
                    return true
                }
            }
        }
    } catch (error) {
        graphChecked = false;
    }

    const frontmatterBlockers = Array.isArray(issue.blockedBy) ? issue.blockedBy.filter(Boolean) : [];

    return !graphChecked && frontmatterBlockers.length > 0
}

/**
 * @summary Builds visibility-only Silent Threads from local synced issue markdown.
 *
 * Candidates are open, unassigned, non-rejected issues outside the Computed Golden Path.
 * They are sorted by `silenceScore = daysIdle * max(structuralWeight, 1)`, keeping this
 * section as an operator/swarm reading surface without changing orchestrator routing.
 *
 * @param {Object} options
 * @param {String} options.issuesDir Local synced issue directory.
 * @param {Date} [options.now=new Date()] Current clock for deterministic tests.
 * @param {Set<String>} [options.goldenIds=new Set()] Current Computed Golden Path issue ids.
 * @param {Number} [options.thresholdMs=aiConfig.goldenPathSilentThreadThresholdMs] Idle threshold.
 * @param {Number} [options.minScore=aiConfig.goldenPathSilentThreadMinScore] Minimum silence score.
 * @param {Object} [options.graphService=GraphService] Memory GraphService singleton or test double.
 * @param {Function} [options.getStructuralWeight=getIssueStructuralWeight] Structural-weight seam.
 * @returns {Array<Object>} Silent-thread candidates sorted by silence score.
 */
export function buildSilentThreadCandidates({
    issuesDir,
    now = new Date(),
    goldenIds = new Set(),
    thresholdMs = aiConfig.goldenPathSilentThreadThresholdMs,
    minScore = aiConfig.goldenPathSilentThreadMinScore,
    graphService = GraphService,
    getStructuralWeight = getIssueStructuralWeight
}) {
    const candidates     = [];
    const nowDate        = now instanceof Date ? now : new Date(now);
    const goldenSet      = new Set([...goldenIds].map(id => String(id)));
    const excludedLabels = new Set([
        'needs-re-triage',
        'no-auto-close',
        'no auto close',
        'duplicate',
        'invalid',
        'wontfix',
        'wont fix'
    ]);

    for (const filePath of collectIssueMarkdownFiles(issuesDir)) {
        let parsed;
        try {
            parsed = matter(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            logger.warn(`[GoldenPathSynthesizer] Failed to parse issue markdown for Silent Threads: ${filePath}`, error);
            continue;
        }

        const meta      = parsed.data || {};
        const labels    = Array.isArray(meta.labels) ? meta.labels.map(label => String(label).toLowerCase()) : [];
        const assignees = Array.isArray(meta.assignees) ? meta.assignees.filter(Boolean) : [];
        const fileId    = path.basename(filePath, '.md');
        const rawId     = meta.id || fileId.replace(/^issue-/, '');
        const issueId   = String(rawId).startsWith('issue-') ? String(rawId) : `issue-${rawId}`;

        if (meta.state !== 'OPEN' ||
            assignees.length > 0 ||
            goldenSet.has(issueId) ||
            labels.some(label => excludedLabels.has(label))) {
            continue;
        }

        if (hasOpenIssueBlocker({issueId, issue: meta, graphService})) {
            continue;
        }

        const lastActivity = findLatestIssueActivity({
            author   : meta.author,
            content  : parsed.content,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt
        });

        if (!lastActivity) continue;

        const idleMs = nowDate - lastActivity.createdAt;
        if (idleMs < thresholdMs) continue;

        const daysIdle         = Math.floor(idleMs / DAY_MS);
        const structuralWeight = getStructuralWeight(issueId, graphService);
        const silenceScore     = daysIdle * Math.max(structuralWeight, 1);

        if (silenceScore < minScore) continue;

        candidates.push({
            daysIdle,
            filePath,
            issueId,
            labels,
            lastActivityAt: lastActivity.createdAt.toISOString(),
            lastActivityBy: lastActivity.author,
            number        : Number(String(issueId).replace(/^issue-/, '')) || rawId,
            reason        : lastActivity.reason,
            silenceScore,
            structuralWeight,
            title         : meta.title || '(no title)',
            url           : meta.githubUrl
        });
    }

    candidates.sort((a, b) =>
        b.silenceScore - a.silenceScore ||
        b.daysIdle - a.daysIdle ||
        b.structuralWeight - a.structuralWeight ||
        Number(a.number) - Number(b.number)
    );

    return candidates
}

/**
 * @summary Renders the Sandman handoff Silent Threads section.
 *
 * @param {Array<Object>} candidates Silent-thread candidates.
 * @param {Object} options
 * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
 * @param {Number} [options.limit=aiConfig.goldenPathSilentThreadRenderLimit] Maximum candidates to render.
 * @returns {String}
 */
export function renderSilentThreadCandidatesSection(candidates, {
    capturedAt = new Date(),
    limit = aiConfig.goldenPathSilentThreadRenderLimit
} = {}) {
    let section = `\n## Silent Threads\n\n`;
    section += `*Captured at: ${capturedAt.toISOString()} (Source: local issue sync + Native Edge Graph; visibility-only, no routing)*\n\n`;

    if (candidates.length === 0) {
        section += `No silent thread candidates detected.\n`;
        return section
    }

    const visibleCandidates = candidates.slice(0, limit);

    if (candidates.length > visibleCandidates.length) {
        section += `Showing ${visibleCandidates.length} of ${candidates.length} candidates, sorted by silence score.\n\n`;
    }

    for (const candidate of visibleCandidates) {
        const issueRef = `#${candidate.number}`;
        section += `- **${issueRef}** — ${candidate.title} — ${candidate.daysIdle} days idle; ` +
            `last activity ${candidate.lastActivityAt} by @${candidate.lastActivityBy}; ` +
            `structural weight ${candidate.structuralWeight.toFixed(2)}; ` +
            `silence score ${candidate.silenceScore.toFixed(2)} (${candidate.reason})\n`;
    }

    return section
}

/**
 * @summary Reads synced issue markdown into deterministic work-item records.
 *
 * @param {String} issuesDir Local synced issue directory.
 * @returns {Array<Object>} Parsed issue work records.
 */
export function readWorkGraphIssueRecords(issuesDir) {
    const records = [];

    for (const filePath of collectIssueMarkdownFiles(issuesDir)) {
        let parsed;
        try {
            parsed = matter(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            logger.warn(`[GoldenPathSynthesizer] Failed to parse issue markdown for Stall Inference: ${filePath}`, error);
            continue;
        }

        const meta    = parsed.data || {},
              issueId = getIssueId(meta, filePath);

        records.push({
            assignees: Array.isArray(meta.assignees) ? meta.assignees.filter(Boolean) : [],
            content  : parsed.content || '',
            filePath,
            issueId,
            labels   : normalizeLabels(meta.labels),
            meta,
            number   : getIssueNumber(meta, issueId),
            title    : meta.title || '(no title)',
            url      : meta.githubUrl
        });
    }

    return records
}

// Only formal dispositions transition the human-gate; COMMENTED (and any unknown state) is neutral —
// it never clears or sets a formal APPROVED/CHANGES_REQUESTED. Mirrors PullRequestService's
// getOutstandingRequestChanges. DISMISSED is formal: as a reviewer's latest, it clears their disposition.
const FORMAL_REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);

// CONTENT_GRAMMAR.md: a `## Reviews` entry is `### `@user` (<STATE>) reviewed on <ISO_Z>`.
const PULL_REVIEW_ENTRY_PATTERN = /^###\s+`(@?[^`]+)`\s+\(([A-Z_]+)\)\s+reviewed on\s+(\S+)/;

/**
 * @summary Extracts the PR number from a `pr-<N>.md` synced-pull path so the candidate set can be
 * ranked WITHOUT reading each file (the pre-parse bound).
 * @param {String} filePath
 * @returns {Number} the PR number, or `-1` when the basename does not match (ranked last).
 * @private
 */
function prNumberFromPath(filePath) {
    const match = /pr-(\d+)\.md$/.exec(filePath);

    return match ? Number(match[1]) : -1
}

/**
 * @summary Parses the `## Reviews` section of a synced-pull body into structured per-review facts —
 * the shape {@link getPrHumanGateState} consumes. CONTENT_GRAMMAR.md serializes each review as
 * `` ### `@user` (<STATE>) reviewed on <ISO_Z> ``; only the `## Reviews` section is scanned (the next
 * `## ` header bounds it, per the grammar's "separate sections" rule). An unknown STATE is kept
 * verbatim — neutral downstream, since the gate acts only on APPROVED / CHANGES_REQUESTED.
 * @param {String} body The markdown body (frontmatter already stripped by gray-matter).
 * @returns {Array<{author: String, state: String, submittedAt: String}>}
 * @private
 */
function parsePullReviewEntries(body) {
    if (typeof body !== 'string' || !body.includes('## Reviews')) {
        return []
    }

    const reviews   = [];
    let   inReviews = false;

    for (const line of body.split('\n')) {
        if (/^##\s+\S/.test(line)) {
            inReviews = /^##\s+Reviews\s*$/.test(line);
            continue
        }

        if (!inReviews) continue;

        const match = PULL_REVIEW_ENTRY_PATTERN.exec(line);

        if (match) {
            reviews.push({author: match[1].trim(), state: match[2], submittedAt: match[3]})
        }
    }

    return reviews
}

/**
 * @summary Derives the GitHub-style `reviewDecision` from structured reviews — latest-per-author, with
 * CHANGES_REQUESTED dominating an APPROVED. Mirrors {@link getPrHumanGateState}'s own latest-per-author
 * reduction so the consumer's two reads (`reviewDecision` + `reviews`) cannot disagree.
 * @param {Array<{author: String, state: String, submittedAt: String}>} reviews
 * @returns {String|null} `'CHANGES_REQUESTED'` | `'APPROVED'` | `null` (no decisive review).
 * @private
 */
function deriveReviewDecision(reviews) {
    const latestByAuthor = new Map();

    for (const review of reviews) {
        // COMMENTED (and unknown) is neutral — only a formal review is a reviewer's disposition.
        if (!FORMAL_REVIEW_STATES.has(review.state)) continue;

        const existing = latestByAuthor.get(review.author);

        if (!existing || new Date(review.submittedAt || 0) > new Date(existing.submittedAt || 0)) {
            latestByAuthor.set(review.author, review)
        }
    }

    // Latest formal review per author: CHANGES_REQUESTED dominates; a DISMISSED latest clears (neutral).
    const latest = [...latestByAuthor.values()];

    if (latest.some(review => review.state === 'CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
    if (latest.some(review => review.state === 'APPROVED'))          return 'APPROVED';

    return null
}

/**
 * @summary Reads synced pull-request markdown into deterministic PR records — the sibling of
 * {@link readWorkGraphIssueRecords} for the fleet-activity PR/lane slot. Each record projects the
 * synced frontmatter (`number`, `title`, `author`, `state`, lifecycle timestamps, `url`) PLUS the
 * structured review facts the consumer actually reads: `reviews: [{author, state, submittedAt}]`
 * parsed from the `## Reviews` body section (CONTENT_GRAMMAR.md) and the derived `reviewDecision` —
 * so `getPrHumanGateState` (fleetPrLaneActivityAdapter) emits truthful approved / changes-requested
 * facts rather than reading raw frontmatter that never carried them.
 *
 * **Absent vs unreadable (three states, not two).** An OMITTED `pullsDir` is the caller's concern (the
 * wiring returns honest-empty WITHOUT calling this reader). A CONFIGURED directory that cannot be
 * collected — missing or unreadable — **THROWS** (via `collectIssueMarkdownFiles`' `fs.readdirSync`);
 * the wiring's catch turns that into the slot's `degraded` capability, never a silent `[]` that would
 * read as valid-empty. A configured, readable, PR-less directory is the only `[]` this reader returns.
 * A single stray/malformed file is still skip-soft — one bad file must not fail the whole read.
 *
 * **Bounded before parse.** When `limit` is a non-negative number, the PR-number-descending candidate
 * set is sliced BEFORE any `fs.readFileSync` / `gray-matter`, so a 300+-file corpus never fully parses
 * to fill a small event window. PR numbers come from the `pr-<N>.md` filename — no read to rank.
 *
 * **`isDraft` is intentionally unset.** CONTENT_GRAMMAR.md carries no draft frontmatter field, so a
 * synced record cannot assert draft state; it is left absent (unknown) rather than fabricated `false`.
 *
 * @param {String} pullsDir Local synced pulls directory (`resources/content/pulls`).
 * @param {Object} [options]
 * @param {Number} [options.limit] Max PR records to parse, newest-PR-first; omit to parse all.
 * @returns {Array<Object>} Parsed PR records; `[]` only when the (readable) directory holds no PRs.
 * @throws when `pullsDir` cannot be collected (missing/unreadable) — the caller's catch degrades the slot.
 */
export function readSyncedPullRecords(pullsDir, {limit} = {}) {
    // Collection failure PROPAGATES by design (a configured-but-unreadable dir → the wiring's catch →
    // degraded capability). Only the per-file parse below is skip-soft.
    const files = collectIssueMarkdownFiles(pullsDir);

    // Bound BEFORE parsing: rank by the PR number in the filename (no read), keep the newest `limit`.
    const ordered = (typeof limit === 'number' && limit >= 0)
        ? files
            .map(filePath => ({filePath, number: prNumberFromPath(filePath)}))
            .sort((left, right) => right.number - left.number)
            .slice(0, limit)
            .map(entry => entry.filePath)
        : files;

    const records = [];

    for (const filePath of ordered) {
        let parsed;

        try {
            parsed = matter(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            logger.warn(`[fleet-activity] failed to parse synced pull markdown: ${filePath}`, error);
            continue
        }

        const meta = parsed.data || {};

        // Skip any non-PR markdown (a record with no `number` in its frontmatter); every synced
        // pull file carries its PR number, so this only guards against stray index/metadata files.
        if (meta.number === undefined || meta.number === null) {
            continue
        }

        const body    = parsed.content || '',
              reviews = parsePullReviewEntries(body);

        records.push({...meta, body, filePath, reviews, reviewDecision: deriveReviewDecision(reviews)})
    }

    return records
}

/**
 * @summary Detects deliberate-defer state for an issue work item.
 *
 * @param {Object} issue Parsed issue work record.
 * @param {Date} now Capture timestamp.
 * @param {Object} graphService Graph service or test double.
 * @returns {Object} Normalized defer disposition.
 */
export function getIssueDeferDisposition(issue, now = new Date(), graphService = GraphService) {
    const deferredLabels = issue.labels.filter(label => DEFER_LABELS.has(label));
    const observedAt     = toIsoString(now);

    if (deferredLabels.length > 0) {
        return {
            anchorArtifact: `#${issue.number}`,
            authority     : `issue-label:${deferredLabels[0]}`,
            deferredAt    : toIsoString(issue.meta.updatedAt || issue.meta.createdAt, now),
            evidenceRefs  : [`#${issue.number}`, `label:${deferredLabels[0]}`],
            exitCondition : `remove ${deferredLabels[0]} or replace it with a narrower ready-state signal`,
            state         : 'deferred'
        }
    }

    const blockedBy = Array.isArray(issue.meta.blockedBy) ? issue.meta.blockedBy.filter(Boolean) : [];
    if (blockedBy.length > 0) {
        const hasOpenBlocker = hasOpenIssueBlocker({
            issueId: issue.issueId,
            issue  : issue.meta,
            graphService
        });

        return {
            anchorArtifact: `#${issue.number}`,
            authority     : 'issue-blocker-edge',
            deferredAt    : toIsoString(issue.meta.updatedAt || issue.meta.createdAt, now),
            evidenceRefs  : [`#${issue.number}`, `blockedBy:${blockedBy.join(',')}`],
            exitCondition : `close blocker ${blockedBy.map(id => `#${String(id).replace(/^issue-/, '')}`).join(', ')}`,
            lastVerifiedAt: observedAt,
            state         : hasOpenBlocker ? 'deferred' : 'stale-defer'
        }
    }

    const marker = /DEFERRED-ON:\s*(.+)$/im.exec(issue.content || '');
    if (marker) {
        return {
            anchorArtifact: `#${issue.number}`,
            authority     : 'doc-marker',
            deferredAt    : toIsoString(issue.meta.updatedAt || issue.meta.createdAt, now),
            evidenceRefs  : [`#${issue.number}`, 'DEFERRED-ON marker'],
            exitCondition : marker[1].trim(),
            state         : marker[1].trim() ? 'deferred' : 'candidate-defer'
        }
    }

    return {state: 'none'}
}

/**
 * @summary Detects deliberate PR parking from the canonical `Parked-on:` adapter.
 *
 * @param {Object} pr GitHub PR payload.
 * @param {Date} now Capture timestamp.
 * @returns {Object} Normalized defer disposition.
 */
export function getPrDeferDisposition(pr, now = new Date()) {
    const body = String(pr?.body || '');
    if (!/\bParked-on:/i.test(body)) return {state: 'none'};

    const match = PR_PARKED_ON_PATTERN.exec(body);
    if (!match) {
        return {
            anchorArtifact: `PR #${pr.number}`,
            authority     : 'pr-body',
            deferredAt    : toIsoString(pr.updatedAt || pr.createdAt, now),
            evidenceRefs  : [`PR #${pr.number}`, 'Parked-on line'],
            exitCondition : null,
            state         : 'candidate-defer'
        }
    }

    return {
        anchorArtifact: match[1],
        authority     : 'pr-body',
        deferredAt    : toIsoString(pr.updatedAt || pr.createdAt, now),
        evidenceRefs  : [`PR #${pr.number}`, match[1], match[2] ? `[${match[2]}]` : null].filter(Boolean),
        exitCondition : match[3].trim(),
        state         : 'deferred'
    }
}

/**
 * @summary Resolves the latest FORMAL review per reviewer for a PR. COMMENTED (and unknown) states are
 * neutral — they never supersede an APPROVED/CHANGES_REQUESTED; DISMISSED is formal and clears it.
 * @param {Object[]} reviews GitHub PR review payloads.
 * @returns {Object[]} Latest formal review per author.
 */
function getLatestReviewsByAuthor(reviews = []) {
    const latestByAuthor = new Map();

    for (const review of Array.isArray(reviews) ? reviews : []) {
        // COMMENTED (and any unknown state) is neutral — it must not supersede a reviewer's formal
        // disposition, so only formal reviews compete for "latest" here.
        if (!FORMAL_REVIEW_STATES.has(review.state)) continue;

        const author      = review.author?.login || review.author || 'unknown';
        const submittedAt = new Date(review.submittedAt || review.createdAt || 0);
        const existing    = latestByAuthor.get(author);

        if (!existing || submittedAt > new Date(existing.submittedAt || existing.createdAt || 0)) {
            latestByAuthor.set(author, review);
        }
    }

    return [...latestByAuthor.values()]
}

/**
 * @summary Returns approval-readiness derived from structured PR reviews.
 *
 * `updatedAt` is deliberately not a motion predicate. A PR leaves
 * `DECISION_STARVED` only through merge/close, required changes, or loss of
 * approval.
 *
 * @param {Object} pr GitHub PR payload.
 * @returns {{approved: Boolean, approvedAt: String|null, changedRequested: Boolean}}
 */
export function getPrHumanGateState(pr) {
    if (pr.reviewDecision === 'CHANGES_REQUESTED') {
        return {approved: false, approvedAt: null, changedRequested: true}
    }

    const latestReviews    = getLatestReviewsByAuthor(pr.reviews);
    const changedRequested = latestReviews.some(review => review.state === 'CHANGES_REQUESTED');
    const approvals        = latestReviews.filter(review => review.state === 'APPROVED');

    if (changedRequested || approvals.length === 0) {
        return {approved: false, approvedAt: null, changedRequested}
    }

    approvals.sort((a, b) => new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0));

    return {
        approved  : true,
        approvedAt: toIsoString(approvals[0].submittedAt || approvals[0].createdAt || pr.createdAt)
    }
}

/**
 * @summary Builds one durable stall finding object.
 *
 * @param {Object} options Finding fields.
 * @returns {Object}
 */
function buildStallFinding({
    capturedAt,
    deferDisposition = {state: 'none'},
    evidenceRefs = [],
    findingClass,
    grade = 'verified-stall',
    motionPredicate,
    presenceSource,
    sourceFidelity = 'verified',
    subject,
    verificationSource,
    waitingSince
}) {
    const observedAt = toIsoString(capturedAt);

    return {
        deferDisposition,
        evidenceRefs  : evidenceRefs.filter(Boolean),
        findingClass,
        firstSeen     : observedAt,
        grade,
        lastSeen      : observedAt,
        lastVerifiedAt: observedAt,
        motionPredicate,
        observedAt,
        presenceSource,
        sourceFidelity,
        subject,
        ttlExpiresAt  : new Date(new Date(observedAt).getTime() + STALL_FINDING_TTL_MS).toISOString(),
        verificationSource,
        waitingSince  : waitingSince ? toIsoString(waitingSince, capturedAt) : observedAt
    }
}

/**
 * @summary Builds deterministic work-graph stall findings for the handoff surface.
 *
 * This pass is visibility-only: it emits data for `sandman_handoff.md` and does
 * not reassign work, file tickets, wake peers, or mutate Golden Path routing
 * weights.
 *
 * @param {Object} options
 * @param {String} options.issuesDir Local synced issue directory.
 * @param {Object[]} [options.prs=[]] Open PR payloads from GitHub.
 * @param {Date} [options.now=new Date()] Capture timestamp.
 * @param {Object[]} [options.identities=IDENTITIES] AgentIdentity roots.
 * @param {Object} [options.graphService=GraphService] Graph service or test double.
 * @returns {Object[]} Stall findings.
 */
export function buildWorkGraphStallFindings({
    issuesDir,
    prs = [],
    now = new Date(),
    identities = IDENTITIES,
    graphService = GraphService
}) {
    if (!issuesDir) return [];

    const
        findings      = [],
        issueRecords  = readWorkGraphIssueRecords(issuesDir),
        statusByLogin = getParticipationStatusByLogin(identities);

    for (const issue of issueRecords) {
        if (issue.meta.state !== 'OPEN') continue;

        const deferDisposition = getIssueDeferDisposition(issue, now, graphService);
        if (deferDisposition.state === 'deferred' || deferDisposition.state === 'candidate-defer') continue;

        if (deferDisposition.state === 'stale-defer') {
            findings.push(buildStallFinding({
                capturedAt     : now,
                deferDisposition,
                evidenceRefs   : deferDisposition.evidenceRefs,
                findingClass   : 'STALE_DEFER',
                grade          : 'candidate-stall',
                motionPredicate: 'defer exit condition is satisfied and no class-specific motion has been recorded after the defer',
                presenceSource : 'issue blocker/defer adapter',
                sourceFidelity : 'candidate',
                subject        : {
                    id    : issue.issueId,
                    number: issue.number,
                    title : issue.title,
                    type  : 'ISSUE',
                    url   : issue.url
                },
                verificationSource: 'local issue sync + graph blocker state',
                waitingSince      : deferDisposition.deferredAt
            }));
        }

        const inactiveAssignees = issue.assignees
            .map(login => statusByLogin.get(String(login).replace(/^@/, '')))
            .filter(status => status && INACTIVE_PARTICIPATION_STATUSES.has(status.participationStatus));

        if (inactiveAssignees.length > 0) {
            const assignee = inactiveAssignees[0];
            findings.push(buildStallFinding({
                capturedAt     : now,
                evidenceRefs   : [`#${issue.number}`, `ai/graph/identityRoots.mjs:${assignee.login}:${assignee.participationStatus}`],
                findingClass   : 'OWNER_BENCHED_LANE',
                motionPredicate: 'owned open work moves when AgentIdentity.participationStatus returns active, the lane is reassigned, or linked work advances under an active owner',
                presenceSource : 'AgentIdentity.participationStatus',
                subject        : {
                    id    : issue.issueId,
                    number: issue.number,
                    owner : assignee.login,
                    title : issue.title,
                    type  : 'ISSUE',
                    url   : issue.url
                },
                verificationSource: 'identityRoots.mjs + local issue sync',
                waitingSince      : assignee.since || issue.meta.createdAt
            }));
        }

        if (issue.labels.includes(EPIC_LABEL)) {
            const
                total             = Number(issue.meta.subIssuesTotal),
                completed         = Number(issue.meta.subIssuesCompleted),
                allSubsClosed     = Number.isFinite(total) && total > 0 && Number.isFinite(completed) && completed >= total,
                hasActiveAssignee = issue.assignees.some(login => {
                    const status = statusByLogin.get(String(login).replace(/^@/, ''));
                    return status?.participationStatus === 'active'
                });

            if (allSubsClosed && !hasActiveAssignee) {
                findings.push(buildStallFinding({
                    capturedAt     : now,
                    evidenceRefs   : [`#${issue.number}`, `subIssuesCompleted:${completed}`, `subIssuesTotal:${total}`],
                    findingClass   : 'RESOLUTION_PENDING',
                    motionPredicate: 'parent epic closes, /epic-resolution posts a verdict, or a required sub reopens',
                    presenceSource : issue.assignees.length > 0 ? 'AgentIdentity.participationStatus' : 'issue assignee state',
                    sourceFidelity : issue.assignees.length > 0 ? 'verified' : 'candidate',
                    grade          : issue.assignees.length > 0 ? 'verified-stall' : 'candidate-stall',
                    subject        : {
                        id    : issue.issueId,
                        number: issue.number,
                        title : issue.title,
                        type  : 'ISSUE',
                        url   : issue.url
                    },
                    verificationSource: 'local issue sync sub-issue counters',
                    waitingSince      : issue.meta.updatedAt || issue.meta.createdAt
                }));
            }
        }
    }

    for (const pr of Array.isArray(prs) ? prs : []) {
        if (pr.state && pr.state !== 'OPEN') continue;
        if (pr.isDraft) continue;
        if (pr.mergedAt || pr.closedAt) continue;

        const deferDisposition = getPrDeferDisposition(pr, now);
        if (deferDisposition.state === 'deferred' || deferDisposition.state === 'candidate-defer') continue;

        const gateState = getPrHumanGateState(pr);
        if (!gateState.approved) continue;

        findings.push(buildStallFinding({
            capturedAt     : now,
            deferDisposition,
            evidenceRefs   : [`PR #${pr.number}`, pr.url, gateState.approvedAt ? `approvedAt:${gateState.approvedAt}` : null],
            findingClass   : 'DECISION_STARVED',
            motionPredicate: 'PR merges, closes, receives a new required-change state, or loses approval/merge readiness',
            presenceSource : 'GitHub PR review state',
            subject        : {
                id    : `pr-${pr.number}`,
                number: pr.number,
                owner : 'human-merge-gate',
                title : pr.title || '(no title)',
                type  : 'PR',
                url   : pr.url
            },
            verificationSource: 'GitHub PR list reviews',
            waitingSince      : gateState.approvedAt || pr.createdAt
        }));
    }

    findings.sort((a, b) =>
        (a.grade === 'verified-stall' ? 0 : 1) - (b.grade === 'verified-stall' ? 0 : 1) ||
        String(a.findingClass).localeCompare(String(b.findingClass)) ||
        String(a.subject?.type).localeCompare(String(b.subject?.type)) ||
        Number(a.subject?.number || 0) - Number(b.subject?.number || 0)
    );

    return findings
}

/**
 * @summary Renders bounded work-graph stall findings into the Sandman handoff.
 *
 * @param {Object[]} findings Stall finding payloads.
 * @param {Object} options
 * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
 * @param {Number} [options.limit=aiConfig.goldenPathStallFindingRenderLimit] Maximum verified findings to render.
 * @param {Boolean} [options.renderEnabled=aiConfig.goldenPathStallFindingRenderEnabled] Render flag.
 * @returns {String}
 */
export function renderWorkGraphStallFindingsSection(findings = [], {
    capturedAt = new Date(),
    limit = aiConfig.goldenPathStallFindingRenderLimit,
    renderEnabled = aiConfig.goldenPathStallFindingRenderEnabled
} = {}) {
    if (renderEnabled === false) return '';

    let section = `\n## Work-Graph Stall Inference\n\n`;
    section += `*Captured at: ${capturedAt.toISOString()} (Source: local issue sync + GitHub PR state; visibility-only, no wakes, no reassignment, no routing-weight changes)*\n\n`;

    if (findings.length === 0) {
        section += `No verified stall findings detected.\n`;
        return section
    }

    const verified        = findings.filter(finding => finding.grade === 'verified-stall');
    const advisory        = findings.filter(finding => finding.grade !== 'verified-stall');
    const visibleVerified = verified.slice(0, limit);

    section += `### Verified Stalls (\`${visibleVerified.length}\` of \`${verified.length}\` items)\n`;

    for (const finding of visibleVerified) {
        const subjectRef = finding.subject?.type === 'PR'
            ? `PR #${finding.subject.number}`
            : `#${finding.subject?.number}`;
        const title = finding.subject?.title || '(no title)';

        section += `- **${subjectRef}** — ${title} — \`${finding.findingClass}\`\n`;
        section += `  - Motion predicate: ${finding.motionPredicate}\n`;
        section += `  - waitingSince: ${finding.waitingSince}; grade: ${finding.grade}; fidelity: ${finding.sourceFidelity}\n`;
        section += `  - Evidence: ${finding.evidenceRefs.join(' · ')}\n`;
        section += `  - Unblock leverage: one stalled lane returns to motion when the predicate clears; detector takes no action.\n`;
    }

    if (advisory.length > 0) {
        section += `\n<details><summary>Candidate / source-degraded findings (${advisory.length})</summary>\n\n`;
        advisory.slice(0, limit).forEach(finding => {
            const subjectRef = finding.subject?.type === 'PR'
                ? `PR #${finding.subject.number}`
                : `#${finding.subject?.number}`;
            section += `- **${subjectRef}** — ${finding.subject?.title || '(no title)'} — \`${finding.findingClass}\` — ${finding.grade}; evidence: ${finding.evidenceRefs.join(' · ')}\n`;
        });
        section += `\n</details>\n`;
    }

    return section
}

/**
 * @summary Normalizes labels from graph nodes or synced issue frontmatter.
 *
 * Golden Path consumes labels from both JSON graph payloads and gray-matter
 * frontmatter. Keeping normalization centralized prevents case / whitespace
 * drift from routing non-actionable tickets back into computed work.
 *
 * @param {Array<*>} labels Raw label values.
 * @returns {String[]} Lowercase label names.
 */
export function normalizeLabels(labels = []) {
    return Array.isArray(labels)
        ? labels.map(label => String(label).trim().toLowerCase()).filter(Boolean)
        : []
}

/**
 * @summary Derives the visible open-sub count from synced issue frontmatter counters.
 *
 * GitHub issue sync records parent-child topology in deterministic frontmatter
 * (`subIssuesTotal`, `subIssuesCompleted`). Current Focus consumes that local
 * substrate rather than making live GitHub calls during Golden Path generation.
 *
 * @param {Object} meta Issue frontmatter.
 * @returns {Number|null} Open sub-issue count, or `null` when counters are absent.
 */
export function getOpenSubIssueCount(meta = {}) {
    const total = Number(meta.subIssuesTotal);
    if (!Number.isFinite(total) || total < 0) return null;

    const completed = Number(meta.subIssuesCompleted);

    return Math.max(0, total - (Number.isFinite(completed) && completed > 0 ? completed : 0))
}

/**
 * @summary Scores one synced issue as a current release / incident focus candidate.
 *
 * This is deliberately a local-sync signal, not graph-centrality routing. It
 * gives the handoff a deterministic "what is hot now" section even when the
 * graph has not accumulated edges for a same-day regression or release ticket.
 *
 * @param {Object} options
 * @param {Object} options.meta Issue frontmatter.
 * @param {String} [options.content=''] Markdown body without frontmatter.
 * @param {Date} [options.now=new Date()] Current clock.
 * @param {Number} [options.windowMs=CURRENT_FOCUS_WINDOW_MS] Freshness window.
 * @returns {Object|null}
 */
export function scoreCurrentFocusIssue({
    meta,
    content = '',
    now = new Date(),
    windowMs = CURRENT_FOCUS_WINDOW_MS
}) {
    if (!meta || meta.state !== 'OPEN') return null;

    const labels = normalizeLabels(meta.labels);
    const isEpic = labels.includes(EPIC_LABEL);
    if (labels.some(label => CURRENT_FOCUS_EXCLUDED_LABELS.has(label) && label !== EPIC_LABEL)) return null;

    const nowDate      = now instanceof Date ? now : new Date(now);
    const createdAt    = new Date(meta.createdAt);
    const updatedAt    = new Date(meta.updatedAt || meta.createdAt);
    const freshCreated = !Number.isNaN(createdAt.getTime()) && nowDate - createdAt <= windowMs;
    const freshUpdated = !Number.isNaN(updatedAt.getTime()) && nowDate - updatedAt <= windowMs;
    const milestone    = typeof meta.milestone === 'string' ? meta.milestone : meta.milestone?.title;
    const title        = String(meta.title || '');
    const issueText    = `${meta.title || ''}\n${content || ''}`;

    let   score          = 0;
    const reasons        = [];
    let   hasFocusSignal = false;

    if (/\bPRIO[-\s]?ZERO\b/i.test(issueText)) {
        score += 120;
        reasons.push('prio-zero');
        hasFocusSignal = true;
    }
    if (labels.includes('bug') || labels.includes('regression')) {
        score += 90;
        reasons.push('incident');
        hasFocusSignal = true;
    }
    // Read the current release at the use site — AiConfig is the reactive SSOT; a module-load capture
    // would go stale. The title matcher is regex-escaped (the version carries a literal '.').
    const currentRelease = aiConfig.currentReleaseVersion;

    if (milestone === currentRelease || (isEpic && new RegExp(`\\b${escapeRegExp(currentRelease)}\\b`, 'i').test(title))) {
        score += 70;
        reasons.push(currentRelease);
        hasFocusSignal = true;
    }
    if (labels.some(label => ['architecture', 'model-experience', 'performance'].includes(label))) {
        score += 30;
        reasons.push('agent-os');
        hasFocusSignal = true;
    }
    if (freshCreated || freshUpdated) {
        score += freshCreated ? 20 : 10;
        reasons.push(freshCreated ? 'fresh-created' : 'fresh-updated');
    }

    if (!hasFocusSignal || (!freshCreated && !freshUpdated && milestone !== currentRelease)) return null;
    if (isEpic && !reasons.some(reason => reason === currentRelease || EPIC_CURRENT_FOCUS_REASONS.has(reason))) return null;

    const rawNumber = meta.id || meta.number;

    return {
        isEpic,
        labels,
        lastActivityAt   : Number.isNaN(updatedAt.getTime()) ? null : updatedAt.toISOString(),
        milestone,
        number           : Number(rawNumber) || rawNumber,
        openSubIssueCount: isEpic ? getOpenSubIssueCount(meta) : null,
        reasons          : [...new Set(reasons)],
        score,
        title            : meta.title || '(no title)'
    }
}

/**
 * @summary Builds current release / incident focus candidates from synced issue markdown.
 *
 * @param {Object} options
 * @param {String} options.issuesDir Local synced issue directory.
 * @param {Date} [options.now=new Date()] Current clock for deterministic tests.
 * @param {Number} [options.windowMs=CURRENT_FOCUS_WINDOW_MS] Freshness window.
 * @returns {Array<Object>} Candidates sorted by score, freshness, then issue number.
 */
export function buildCurrentFocusCandidates({
    issuesDir,
    now = new Date(),
    windowMs = CURRENT_FOCUS_WINDOW_MS
}) {
    const candidates = [];

    for (const filePath of collectIssueMarkdownFiles(issuesDir)) {
        let parsed;
        try {
            parsed = matter(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            logger.warn(`[GoldenPathSynthesizer] Failed to parse issue markdown for Current Focus: ${filePath}`, error);
            continue;
        }

        const candidate = scoreCurrentFocusIssue({
            meta   : parsed.data || {},
            content: parsed.content,
            now,
            windowMs
        });

        if (candidate) {
            candidates.push(candidate);
        }
    }

    candidates.sort((a, b) =>
        b.score - a.score ||
        new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0) ||
        Number(b.number) - Number(a.number)
    );

    return candidates
}

/**
 * @summary Renders the current release / incident focus section.
 *
 * @param {Array<Object>} candidates Current focus candidates.
 * @param {Object} options
 * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
 * @param {Number} [options.limit=5] Maximum candidates to render.
 * @returns {String}
 */
export function renderCurrentFocusCandidatesSection(candidates, {
    capturedAt = new Date(),
    limit = 5
} = {}) {
    let section = `\n## Current Release / Incident Focus\n\n`;
    section += `*Captured at: ${capturedAt.toISOString()} (Source: local issue sync; release/incident signal, not graph-centrality routing)*\n\n`;

    if (candidates.length === 0) {
        section += `No current release or incident focus candidates detected.\n`;
        return section
    }

    const visibleCandidates = candidates.slice(0, limit);

    if (candidates.length > visibleCandidates.length) {
        section += `Showing ${visibleCandidates.length} of ${candidates.length} candidates, sorted by current-focus score.\n\n`;
    }

    for (const candidate of visibleCandidates) {
        const labels    = candidate.labels.length > 0 ? ` [\`${candidate.labels.join('`, `')}\`]` : '';
        const epic      = candidate.isEpic ? ' — **epic umbrella**' : '';
        const milestone = candidate.milestone ? ` — milestone ${candidate.milestone}` : '';
        const openSubs  = candidate.isEpic && Number.isFinite(candidate.openSubIssueCount)
            ? ` — ${candidate.openSubIssueCount} open sub${candidate.openSubIssueCount === 1 ? '' : 's'}`
            : '';
        const reasons = candidate.reasons.length > 0 ? ` — reasons: ${candidate.reasons.join(', ')}` : '';

        section += `- **#${candidate.number}**${epic}${labels}${milestone}${openSubs} — score ${candidate.score}${reasons}\n`;
        section += `  - *${candidate.title}*\n`;
    }

    return section
}
