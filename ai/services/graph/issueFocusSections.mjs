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
const V13_1_PATTERN           = /\bv13\.1\b/i;

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

const EPIC_CURRENT_FOCUS_REASONS = Object.freeze(new Set([
    'incident',
    'prio-zero',
    'v13.1'
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
    const comments = [];
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
    const assigneeSet = new Set(assignees);
    const events = [];
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
    const assigneeSet  = new Set(issue.assignees || []);
    const maintainerSet = new Set(maintainers);
    const candidates   = [];

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
    const candidates = [];
    const nowDate    = now instanceof Date ? now : new Date(now);
    const goldenSet  = new Set([...goldenIds].map(id => String(id)));
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

    let score = 0;
    const reasons = [];
    let hasFocusSignal = false;

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
    if (milestone === 'v13.1' || (isEpic && V13_1_PATTERN.test(title))) {
        score += 70;
        reasons.push('v13.1');
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

    if (!hasFocusSignal || (!freshCreated && !freshUpdated && milestone !== 'v13.1')) return null;
    if (isEpic && !reasons.some(reason => EPIC_CURRENT_FOCUS_REASONS.has(reason))) return null;

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
