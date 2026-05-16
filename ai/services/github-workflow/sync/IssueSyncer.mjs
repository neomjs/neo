import aiConfig                                      from '../../../mcp/server/github-workflow/config.mjs';
import Base                                          from '../../../../src/core/Base.mjs';
import crypto                                        from 'crypto';
import fs                                            from 'fs/promises';
import logger                                        from '../../../mcp/server/github-workflow/logger.mjs';
import matter                                        from 'gray-matter';
import path                                          from 'path';
import semver                                        from 'semver';
import GraphqlService                                from '../GraphqlService.mjs';
import ReleaseNotesSyncer                                 from './ReleaseNotesSyncer.mjs';
import {FETCH_ISSUE_TIMELINE_PAGE, FETCH_ISSUES_FOR_SYNC, FETCH_SINGLE_ISSUE} from '../queries/issueQueries.mjs';
import {GET_ISSUE_ID, UPDATE_ISSUE}                                                                        from '../queries/mutations.mjs';
import contentPath                                      from '../shared/contentPath.mjs';
import {createContentIndexEntry, updateContentIndex}    from '../shared/contentIndex.mjs';

const issueSyncConfig = aiConfig.issueSync;
const lineBreaksRegex = /[\r\n]+/g;

/**
 * @summary Handles fetching, creating, and updating local issue files from GitHub.
 *
 * This service manages the conversion between the GitHub issue JSON format and
 * the local Markdown format with frontmatter. It handles the logic for:
 * - Formatting issue bodies and comments
 * - Archiving closed issues based on milestones or release dates
 * - Detecting content changes via hashing
 * - Pushing local edits back to GitHub
 *
 * @class Neo.ai.services.github-workflow.sync.IssueSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class IssueSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.sync.IssueSyncer'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.sync.IssueSyncer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Per-sync-cycle dedupe set tracking issue numbers already emitted as ARCHIVE ANOMALY WARN.
     * `#planBuckets` is invoked from multiple sync entry points (pullFromGitHub, refetchIssuesByNumber,
     * reconcileClosedIssueLocations) which would otherwise duplicate-warn for the same issue within
     * a single sync. Cleared at the top of `pullFromGitHub` (the natural sync-cycle entrypoint).
     * @member {Set<number>} #warnedAnomalies
     * @private
     */
    #warnedAnomalies = new Set();

    /**
     * Calculates a SHA-256 hash of the given content for change detection.
     * @param {string} content The content to hash.
     * @returns {string} The hex-encoded hash.
     * @private
     */
    #calculateContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * @summary Continuation-fetches remaining timelineItems pages for an issue until exhausted.
     *
     * GitHub's GraphQL `timelineItems` connection returns events oldest-first with no `orderBy`,
     * so the default `first: N` request truncates the tail. Once total events exceed N, newly-
     * authored comments and structural events silently disappear from the rendered markdown
     * while scalar metadata (`updatedAt`) stays correct — a divergence between the metadata
     * path and the content-rendering path.
     *
     * This helper is the pagination primitive: it detects `pageInfo.hasNextPage` and loops
     * `FETCH_ISSUE_TIMELINE_PAGE` with the previous cursor, concatenating nodes in place on
     * the issue object. Emits a warning log on continuation to make cap-edge conditions visible.
     *
     * @param {object} issue The GraphQL issue node with its first page of timelineItems already populated.
     * @returns {Promise<void>}
     * @private
     * @see https://github.com/neomjs/neo/issues/10090
     */
    async #exhaustTimelineItems(issue) {
        if (!issue.timelineItems?.pageInfo?.hasNextPage) return;

        const startCount = issue.timelineItems.nodes.length;
        let   cursor     = issue.timelineItems.pageInfo.endCursor;
        const allNodes   = [...issue.timelineItems.nodes];

        logger.warn(`⚠️ Timeline continuation required for #${issue.number} — first page had ${startCount} events, more pending`);

        while (cursor) {
            const data = await GraphqlService.query(
                FETCH_ISSUE_TIMELINE_PAGE,
                {
                    owner           : aiConfig.owner,
                    repo            : aiConfig.repo,
                    number          : issue.number,
                    maxTimelineItems: issueSyncConfig.maxTimelineItemsPerIssue,
                    cursor
                },
                true // sub-issues feature
            );

            const page = data.repository.issue.timelineItems;
            allNodes.push(...page.nodes);
            logger.debug(`  📄 Fetched timeline page for #${issue.number}: +${page.nodes.length} events (cumulative: ${allNodes.length})`);

            cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
        }

        issue.timelineItems.nodes    = allNodes;
        issue.timelineItems.pageInfo = {hasNextPage: false, endCursor: null};
    }

    /**
     * @summary Counts `ISSUE_COMMENT` nodes in an issue's exhausted `timelineItems` set.
     *
     * Post-#10090 pagination-exhaust (`#exhaustTimelineItems`) guarantees `timelineItems.nodes`
     * contains the complete per-issue event stream — including every surviving comment. This
     * method returns the authoritative `commentsTotal` for metadata persistence, replacing the
     * pre-timeline-era `issue.comments.totalCount` scalar (#10110). Single source of truth:
     * the metadata value is now structurally guaranteed to match what the timeline renders in
     * the local markdown.
     *
     * MUST be called only after `#exhaustTimelineItems(issue)` has run; otherwise the count
     * reflects only the first timeline page and will under-report on long-timeline issues.
     *
     * @param {object} issue The GitHub issue with an exhausted `timelineItems` connection.
     * @returns {number}
     * @private
     */
    #countTimelineComments(issue) {
        return issue.timelineItems.nodes.filter(n => n.__typename === 'IssueComment').length;
    }

    /**
     * Formats a GitHub issue and its comments into a single Markdown string with YAML frontmatter.
     * @param {object}   issue    The GitHub issue object.
     * @param {object[]} comments An array of comment objects associated with the issue.
     * @returns {string} The fully formatted Markdown string.
     * @private
     */
    #formatIssueMarkdown(issue) {
        // Defensive null-safety per #11481 (follow-up to #11474 / PR #11476's whack-a-mole gap):
        // GitHub GraphQL returns null for issue.author when the author has been deleted (Ghost
        // user), and individual nodes within labels/assignees/subIssues/blockedBy/blocking can
        // also be null when their referenced entities are deleted. Each deref site uses optional
        // chaining + filter-out for list entries. Fallback conventions match #11476's: 'Ghost'
        // for users (matches existing line-186 actor/author convention); '(no title)' for
        // missing entity titles; filter-out for null list entries (preserves array integrity
        // without injecting fallback objects into structured fields).
        const frontmatter = {
            id                : issue.number,
            title             : issue.title?.replace(lineBreaksRegex, ' ') || '(no title)',
            state             : issue.state,
            labels            : (issue.labels?.nodes || []).map(l => l?.name).filter(Boolean),
            assignees         : (issue.assignees?.nodes || []).map(a => a?.login).filter(Boolean),
            createdAt         : issue.createdAt,
            updatedAt         : issue.updatedAt,
            githubUrl         : issue.url,
            author            : issue.author?.login || 'Ghost',
            commentsCount     : this.#countTimelineComments(issue), // Derived from the exhausted timeline — #10110
            parentIssue       : issue.parent?.number ?? null,
            subIssues         : (issue.subIssues?.nodes || []).map(sub =>
                sub ? `[${sub.state === 'CLOSED' ? 'x' : ' '}] ${sub.number} ${sub.title?.replace(lineBreaksRegex, ' ') || '(no title)'}` : null
            ).filter(Boolean),
            subIssuesCompleted: issue.subIssuesSummary?.completed || 0,
            subIssuesTotal    : issue.subIssuesSummary?.total || 0,
            blockedBy         : (issue.blockedBy?.nodes || []).map(b =>
                b ? `[${b.state === 'CLOSED' ? 'x' : ' '}] ${b.number} ${b.title?.replace(lineBreaksRegex, ' ') || '(no title)'}` : null
            ).filter(Boolean),
            blocking          : (issue.blocking?.nodes || []).map(b =>
                b ? `[${b.state === 'CLOSED' ? 'x' : ' '}] ${b.number} ${b.title?.replace(lineBreaksRegex, ' ') || '(no title)'}` : null
            ).filter(Boolean)
        };

        if (issue.closedAt) {
            frontmatter.closedAt = issue.closedAt;
        }
        if (issue.milestone) {
            frontmatter.milestone = issue.milestone.title;
        }

        let body = `# ${issue.title || '(no title)'}\n\n`;

        body += issue.body || '*(No description provided)*';
        body += '\n\n';

        // Add Activity Log / Timeline section
        if (issue.timelineItems?.nodes.length > 0) {
            body += '## Timeline\n\n';
            for (const event of issue.timelineItems.nodes) {
                body += this.#formatTimelineEvent(event);
            }
            body += '\n';
        }

        return matter.stringify(body, frontmatter, {lineWidth: -1});
    }

    /**
     * Formats a single timeline event into a human-readable Markdown string.
     * @param {object} event The timeline event object.
     * @returns {string} The formatted Markdown string for the event.
     * @private
     */
    #formatTimelineEvent(event) {
        const actor = event.actor?.login || event.author?.login || 'Ghost';

        if (event.__typename === 'IssueComment') {
            return `### @${actor} - ${event.createdAt}\n\n${event.body}\n\n`;
        }

        let details = '';

        // Defensive null-safety per #11474: GitHub GraphQL returns null for referenced
        // entities that have been deleted (users, labels, sub-issues, parent issues,
        // blocking issues, commits, cross-referenced sources). Each deref site uses
        // optional chaining + a fallback marker so a single null doesn't abort a sync
        // run that's already processed thousands of issues. Fallback conventions:
        // `'Ghost'` for users (matches existing actor/author convention at line 186);
        // `'(deleted X)'` for named entities; `'?'` for numeric references.
        switch (event.__typename) {
            case 'LabeledEvent':
                details = `added the \`${event.label?.name || '(deleted label)'}\` label`;
                break;
            case 'UnlabeledEvent':
                details = `removed the \`${event.label?.name || '(deleted label)'}\` label`;
                break;
            case 'AssignedEvent':
                details = `assigned to @${event.assignee?.login || 'Ghost'}`;
                break;
            case 'UnassignedEvent':
                details = `unassigned from @${event.assignee?.login || 'Ghost'}`;
                break;
            case 'ClosedEvent':
                details = `closed this issue`;
                break;
            case 'ReopenedEvent':
                details = `reopened this issue`;
                break;
            case 'RenamedTitleEvent':
                details = `changed title from **${event.previousTitle}** to **${event.currentTitle}**`;
                break;
            case 'MilestonedEvent':
                details = `added this to the **${event.milestoneTitle}** milestone`;
                break;
            case 'DemilestonedEvent':
                details = `removed this from the **${event.milestoneTitle}** milestone`;
                break;
            case 'ReferencedEvent':
                const commitMessage = event.commit?.message?.split('\\n')[0] || '(no message)';
                const commitOid     = event.commit?.oid?.substring(0, 7) || '(deleted commit)';
                details = `referenced in commit \`${commitOid}\` - "${commitMessage}"`;
                break;
            case 'CrossReferencedEvent':
                if (event.source) {
                    const sourceRef = event.source.__typename === 'Issue' ? `#${event.source.number}` : `PR #${event.source.number}`;
                    details = `cross-referenced by ${sourceRef}`;
                } else {
                    details = `cross-referenced by (deleted)`;
                }
                break;
            case 'SubIssueAddedEvent':
                details = `added sub-issue #${event.subIssue?.number ?? '?'}`;
                break;
            case 'SubIssueRemovedEvent':
                details = `removed sub-issue #${event.subIssue?.number ?? '?'}`;
                break;
            case 'ParentIssueAddedEvent':
                details = `added parent issue #${event.parent?.number ?? '?'}`;
                break;
            case 'ParentIssueRemovedEvent':
                details = `removed parent issue #${event.parent?.number ?? '?'}`;
                break;
            case 'BlockedByAddedEvent':
                details = `marked this issue as being blocked by #${event.blockingIssue?.number ?? '?'}`;
                break;
            case 'BlockingAddedEvent':
                details = `marked this issue as blocking #${event.blockedIssue?.number ?? '?'}`;
                break;
            case 'BlockedByRemovedEvent':
                details = `removed the block by #${event.blockingIssue?.number ?? '?'}`;
                break;
            case 'BlockingRemovedEvent':
                details = `removed the block on #${event.blockedIssue?.number ?? '?'}`;
                break;
            default:
                details = `performed a "${event.__typename}" event`;
        }

        return `- ${event.createdAt} @${actor} ${details}\n`;
    }

    /**
     * @summary Pre-computes bucket counts and indices for all active and archived issues.
     * @param {Object} metadata The sync metadata.
     * @param {Array} fetchedIssues The delta issues fetched from GitHub.
     * @returns {Map<number, {version: string|null, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planBuckets(metadata, fetchedIssues = []) {
        const combined = new Map();

        for (const [idStr, issue] of Object.entries(metadata.issues || {})) {
            let oldVersion = null;
            if (issue.state === 'CLOSED' && issue.path) {
                const absPath = path.resolve(aiConfig.projectRoot, issue.path);
                if (absPath.startsWith(issueSyncConfig.archiveRoot)) {
                    const relativeToArchive = path.relative(issueSyncConfig.archiveRoot, absPath);
                    const parts = relativeToArchive.split(path.sep);
                    if (parts.length >= 2 && parts[0] === 'issues') {
                        oldVersion = parts[1];
                    }
                }
            }

            combined.set(parseInt(idStr, 10), {
                number: parseInt(idStr, 10),
                state: issue.state,
                milestone: issue.milestone ? { title: issue.milestone } : null,
                closedAt: issue.closedAt,
                oldVersion
            });
        }

        for (const issue of fetchedIssues) {
            // Null-safety per #11481: GitHub may return null label nodes or null name fields
            // when labels have been deleted. Filter-out null/empty so droppedLabels matching
            // works on the valid subset.
            const labels = issue.labels?.nodes
                ? issue.labels.nodes.map(l => l?.name?.toLowerCase()).filter(Boolean)
                : issue.labels?.map(l => l?.name?.toLowerCase() || (typeof l === 'string' ? l.toLowerCase() : null)).filter(Boolean) || [];

            const isDropped = issueSyncConfig.droppedLabels.some(label => labels.includes(label));

            if (isDropped) {
                combined.delete(issue.number);
                continue;
            }

            if (combined.has(issue.number)) {
                const existing = combined.get(issue.number);
                existing.state = issue.state;
                existing.milestone = issue.milestone;
                existing.closedAt = issue.closedAt;
            } else {
                combined.set(issue.number, {
                    number: issue.number,
                    state: issue.state,
                    milestone: issue.milestone,
                    closedAt: issue.closedAt,
                    oldVersion: null
                });
            }
        }

        const buckets = new Map();
        const activeItems = [];

        for (const issue of combined.values()) {
            let version = null;
            if (issue.state === 'CLOSED') {
                if (issue.milestone?.title) {
                    version = issue.milestone.title.startsWith(issueSyncConfig.versionDirectoryPrefix)
                        ? issue.milestone.title
                        : issueSyncConfig.versionDirectoryPrefix + issue.milestone.title;
                } else if (issue.closedAt) {
                    const closed = new Date(issue.closedAt);
                    const release = (ReleaseNotesSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);
                    if (release) {
                        version = release.tagName.startsWith(issueSyncConfig.versionDirectoryPrefix)
                            ? release.tagName
                            : issueSyncConfig.versionDirectoryPrefix + release.tagName;
                    }
                }
            }

            if (issue.state !== 'CLOSED' || !version) {
                activeItems.push(issue);
                continue;
            }

            if (issue.oldVersion && issue.oldVersion !== version) {
                // Filter false-positive WARN volume during ADR 0004 clean-cut migration window (#11486).
                // `oldVersion` derives from the cached path's directory name (see lines ~310-317); during
                // migration, that contains pre-cut title-derived strings (e.g. 'vneo.d.ts - Typescript
                // definitions...') that fail semver validation. Sealed-chunk enforcement at the
                // reconcile step (~L569/L575) already prevents these from causing actual moves, so
                // emitting WARN is pure noise. Real release-boundary recalculations (e.g. v11.12.0 →
                // v11.13.0) where both sides are valid semver remain at WARN.
                const oldIsValidTag = semver.valid(semver.clean(issue.oldVersion)) !== null;
                const newIsValidTag = semver.valid(semver.clean(version))            !== null;

                if (oldIsValidTag && newIsValidTag) {
                    // Dedupe across multiple `#planBuckets` call sites within one sync cycle (#11486).
                    if (!this.#warnedAnomalies.has(issue.number)) {
                        this.#warnedAnomalies.add(issue.number);
                        logger.warn(`🚨 [ARCHIVE ANOMALY] Issue #${issue.number} closedAt shift detected: moving from bucket '${issue.oldVersion}' to '${version}'. Dry-run review required.`);
                    }
                } else {
                    // Migration-state mismatch (one side is not a valid semver tag) — quiet observability only.
                    logger.debug(`[ARCHIVE MIGRATION] Issue #${issue.number}: oldBucket='${issue.oldVersion}' → newBucket='${version}' (sealed-chunk enforcement preserves location)`);
                }
            }

            if (!buckets.has(version)) buckets.set(version, []);
            buckets.get(version).push(issue);
        }

        const plans = new Map();

        activeItems.sort((a, b) => a.number - b.number);
        const activeItemCount = activeItems.length;
        activeItems.forEach((issue, index) => {
            plans.set(issue.number, {
                version: null,
                itemCount: activeItemCount,
                itemIndex: index
            });
        });

        for (const [version, issues] of buckets.entries()) {
            issues.sort((a, b) => a.number - b.number);
            const itemCount = issues.length;
            issues.forEach((issue, index) => {
                plans.set(issue.number, {
                    version,
                    itemCount,
                    itemIndex: index
                });
            });
        }

        return plans;
    }

    /**
     * Determines the correct local file path for a given issue based on its state (OPEN/CLOSED),
     * labels (dropped), and milestone or closed date (for archiving).
     * @param {object} issue The GitHub issue object.
     * @param {Map<number, object>} planBuckets Precomputed bucket distribution.
     * @returns {string|null} The absolute file path for the issue's Markdown file, or null if the issue should be dropped.
     * @private
     */
    #getIssuePath(issue, planBuckets = new Map()) {
        const filename = `${issueSyncConfig.issueFilenamePrefix}${issue.number}.md`;

        // Handle both GraphQL (issue.labels.nodes) and potential direct array.
        // Null-safety per #11481: filter-out null nodes / null name fields (deleted labels).
        const labels = issue.labels?.nodes
            ? issue.labels.nodes.map(l => l?.name?.toLowerCase()).filter(Boolean)
            : issue.labels?.map(l => l?.name?.toLowerCase() || (typeof l === 'string' ? l.toLowerCase() : null)).filter(Boolean) || [];

        const isDropped = issueSyncConfig.droppedLabels.some(label => labels.includes(label));
        if (isDropped) {
            return null; // Dropped issues are not stored locally.
        }

        const plan = planBuckets.get(issue.number);

        const config = {
            contentRoot: issueSyncConfig.contentRoot,
            type: 'issues',
            filename,
            itemIndex: plan?.itemIndex || 0,
            itemsPerChunk: issueSyncConfig.archiveChunkThreshold,
            chunkPrefix: issueSyncConfig.archiveChunkPrefix
        };

        if (plan?.version) {
            config.version = plan.version;
        }

        return contentPath(config);
    }

    /**
     * Resolves a path to an absolute path against the project root.
     * @param {string} p The path to resolve.
     * @returns {string} The absolute path.
     * @private
     */
    #resolvePath(p) {
        if (!p) return null;
        if (path.isAbsolute(p)) return p;
        return path.resolve(aiConfig.projectRoot, p);
    }

    /**
     * Converts an absolute path to a path relative to the project root.
     * @param {string} p The absolute path.
     * @returns {string} The relative path.
     * @private
     */
    #relativePath(p) {
        if (!p) return null;
        return path.relative(aiConfig.projectRoot, p);
    }

    /**
     * Fetches all relevant issues from GitHub using GraphQL with automatic pagination.
     * This single query fetches issues WITH their comments and relationships in one go!
     * @param {object} metadata
     * @returns {Promise<{newMetadata: object, stats: object}>}
     */
    async pullFromGitHub(metadata) {
        logger.info('📥 Fetching issues from GitHub via GraphQL...');

        // Reset per-sync-cycle dedupe set for ARCHIVE ANOMALY WARN emission (#11486).
        // pullFromGitHub is the natural top-of-sync entrypoint; reconcileClosedIssueLocations and
        // refetchIssuesByNumber called later in the cycle will reuse the same set, so the same
        // issue is WARN'd at most once per full sync.
        this.#warnedAnomalies.clear();

        let allIssues   = [];
        let hasNextPage = true;
        let cursor      = null;
        let totalCost   = 0;
        const maxIssues = issueSyncConfig.maxIssues;

        // Paginate through all issues
        while (hasNextPage && allIssues.length < maxIssues) {
            const data = await GraphqlService.query(
                FETCH_ISSUES_FOR_SYNC,
                {
                    owner           : aiConfig.owner,
                    repo            : aiConfig.repo,
                    limit           : 100,
                    cursor,
                    states          : ['OPEN', 'CLOSED'],
                    // Clean-slate sync (metadata.lastSync null) needs to traverse the full repo
                    // history per ADR 0004 §1.3 + §3.6; falling back to syncStartDate (2025-01-01)
                    // would miss pre-2025 issues that haven't been touched since then. Use an
                    // explicit pre-Neo date in that path so GraphQL pulls every issue, then local
                    // droppedLabels + maxIssues caps trim the actual processed set. Empirical anchor:
                    // PR #11461 Cycle 1 review (PRR_kwDODSospM8AAAABAIXzdA) — GPT V-B-A'd the
                    // clean-slate rehydration premise as falsified for caps; this is the symmetric
                    // fix for the date-window slice.
                    since           : metadata.lastSync || '2017-01-01T00:00:00Z',
                    maxLabels       : issueSyncConfig.maxLabelsPerIssue,
                    maxAssignees    : issueSyncConfig.maxAssigneesPerIssue,
                    maxSubIssues    : issueSyncConfig.maxSubIssuesPerIssue,
                    maxTimelineItems: issueSyncConfig.maxTimelineItemsPerIssue
                },
                true // Enable sub-issues feature
            );

            const issues = data.repository.issues;
            allIssues.push(...issues.nodes);

            hasNextPage = issues.pageInfo.hasNextPage;
            cursor      = issues.pageInfo.endCursor;

            // Monitor rate limit usage
            totalCost += data.rateLimit.cost;
            logger.debug(`Fetched ${issues.nodes.length} issues (total: ${allIssues.length}, cost: ${totalCost}, remaining: ${data.rateLimit.remaining})`);

            // Safety check: If rate limit is getting low, warn
            if (data.rateLimit.remaining < 500) {
                logger.warn(`⚠️ GraphQL rate limit low: ${data.rateLimit.remaining} remaining, resets at ${data.rateLimit.resetAt}`);
            }
        }

        logger.info(`Found ${allIssues.length} issues updated since last sync`);

        const newMetadata = {
            issues      : { ...metadata.issues }, // Start with existing metadata
            pushFailures: metadata.pushFailures || [],
            lastSync    : new Date().toISOString()
        };

        const stats = {
            pulled : { count: 0, created: 0, updated: 0, moved: 0, issues: [] },
            dropped: { count: 0, issues: [] }
        };

        const indexMutations = {upsert: [], remove: []};

        const planBuckets = this.#planBuckets(metadata, allIssues);

        // Process each issue
        for (const issue of allIssues) {
            const issueNumber = issue.number;
            let targetPath = this.#getIssuePath(issue, planBuckets);

            const oldIssue = metadata.issues[issueNumber];
            const oldPathRelative = oldIssue?.path;
            const oldAbsolutePath = oldIssue ? this.#resolvePath(oldPathRelative) : null;

            // --- ARCHIVE ANOMALY DETECTION & SEALED-CHUNK SEMANTICS ---
            // Detect if an issue's closedAt timestamp has shifted from a previously known value.
            // Under sealed-chunk semantics, historical items should not jump archive buckets
            // just because a maintainer toggled the state.
            if (oldIssue && issue.state === 'CLOSED') {
                const wasArchived = oldAbsolutePath && oldAbsolutePath.startsWith(issueSyncConfig.archiveRoot);

                if (oldIssue.closedAt && issue.closedAt && oldIssue.closedAt !== issue.closedAt) {
                    logger.warn(`[ARCHIVE ANOMALY] Issue #${issueNumber} closedAt shifted: ${oldIssue.closedAt} -> ${issue.closedAt}.`);

                    if (wasArchived) {
                        logger.warn(`[SEALED CHUNK ENFORCEMENT] Preventing #${issueNumber} from jumping to ${targetPath}. Forcing retention at ${oldAbsolutePath}.`);
                        targetPath = oldAbsolutePath;
                    }
                } else if (wasArchived && targetPath !== oldAbsolutePath) {
                    // Even if closedAt didn't shift, milestone changes could trigger a bucket jump.
                    // We must seal the chunk to prevent registry drift.
                    logger.warn(`[SEALED CHUNK ENFORCEMENT] Issue #${issueNumber} bucket shifted, but it is already archived. Forcing retention at ${oldAbsolutePath}.`);
                    targetPath = oldAbsolutePath;
                }
            }

            if (!targetPath) {
                stats.dropped.count++;
                stats.dropped.issues.push(issueNumber);
                const oldPathRelative = metadata.issues[issueNumber]?.path;
                if (oldPathRelative) {
                    try {
                        const oldPath = this.#resolvePath(oldPathRelative);
                        await fs.unlink(oldPath);
                        logger.debug(`🗑️ Removed dropped issue #${issueNumber}: ${oldPath}`);
                    } catch (e) { /* File might not exist */ }
                }
                // Remove from metadata
                delete newMetadata.issues[issueNumber];

                indexMutations.remove.push({ type: 'issues', id: issueNumber });
                continue;
            }

            const needsUpdate = !oldIssue ||
                oldIssue.updated !== issue.updatedAt ||
                oldAbsolutePath !== targetPath;

            let contentHash = oldIssue?.contentHash;

            if (needsUpdate) {
                stats.pulled.count++;
                stats.pulled.issues.push(issueNumber);

                // Continuation-fetch the full timeline if the first page was truncated.
                // Prevents silent comment-body + structural-event loss on active Epics (#10090).
                await this.#exhaustTimelineItems(issue);

                const markdown = this.#formatIssueMarkdown(issue);
                contentHash = this.#calculateContentHash(markdown);

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, markdown, 'utf-8');

                if (!oldIssue) {
                    stats.pulled.created++;
                    logger.debug(`✨ Created #${issueNumber}: ${targetPath}`);
                } else if (oldAbsolutePath && oldAbsolutePath !== targetPath) {
                    stats.pulled.moved++;
                    try {
                        await fs.rename(oldAbsolutePath, targetPath);
                        logger.debug(`📦 Moved #${issueNumber}: ${oldAbsolutePath} → ${targetPath}`);
                    } catch (e) {
                        logger.warn(`Could not rename #${issueNumber}, falling back to write. Error: ${e.message}`);
                        await fs.unlink(oldAbsolutePath).catch(() => {});
                    }
                } else {
                    stats.pulled.updated++;
                    logger.debug(`✅ Updated #${issueNumber}: ${targetPath}`);
                }
            }

            newMetadata.issues[issueNumber] = {
                state        : issue.state,
                path         : this.#relativePath(targetPath), // Store relative path
                updatedAt    : issue.updatedAt,
                closedAt     : issue.closedAt || null,
                milestone    : issue.milestone?.title || null,
                title        : issue.title,
                contentHash,                                    // Store hash for push comparison
                commentsTotal: this.#countTimelineComments(issue) // Derived from the exhausted timeline — #10110
            };

            const plan = planBuckets.get(issueNumber);
            indexMutations.upsert.push(createContentIndexEntry({
                issueSyncConfig,
                type: 'issues',
                id: issueNumber,
                filePath: this.#resolvePath(this.#relativePath(targetPath)),
                itemIndex: plan ? plan.itemIndex : issueNumber,
                version: issue.state === 'OPEN' ? null : plan?.version || null,
                bucket: null
            }));
        }

        /*
         * Strategy: Timeline-Based Relationship Discovery
         *
         * GitHub does NOT reliably update the `updatedAt` timestamp of a related issue when
         * a relationship change occurs (e.g., adding a sub-issue, blocking relationship).
         * This means our standard delta-sync (based on `since: lastSync`) will miss these updates
         * because the related issue is filtered out by the query.
         *
         * To fix this, we scan the `timelineItems` of every fetched issue for relationship-altering
         * events that occurred since the last sync. We collect the IDs of these related issues
         * and force-update them to ensure referential integrity.
         *
         * This timeline scan handles most cases where relationships change. For the ultra-rare
         * scenario where BOTH sides of a relationship are old and filtered out by delta sync,
         * a periodic full re-sync (e.g., monthly) ensures eventual consistency.
         */
        // Identify related issues that need force-updating
        const relatedIssuesToUpdate = new Set();
        const lastSyncDate = metadata.lastSync ? new Date(metadata.lastSync) : new Date(0);

        allIssues.forEach(issue => {
            // 1. Existing Parent Check (Legacy but safe)
            if (issue.parent) {
                relatedIssuesToUpdate.add(issue.parent.number);
            }

            // 2. Timeline Scan for Relationship Events
            if (issue.timelineItems?.nodes) {
                issue.timelineItems.nodes.forEach(event => {
                    // Only care about events that happened AFTER the last sync
                    if (new Date(event.createdAt) <= lastSyncDate) return;

                    switch (event.__typename) {
                        case 'SubIssueAddedEvent':
                        case 'SubIssueRemovedEvent':
                            if (event.subIssue) relatedIssuesToUpdate.add(event.subIssue.number);
                            break;
                        case 'ParentIssueAddedEvent':
                        case 'ParentIssueRemovedEvent':
                            if (event.parent) relatedIssuesToUpdate.add(event.parent.number);
                            break;
                        case 'BlockedByAddedEvent':
                        case 'BlockedByRemovedEvent':
                            if (event.blockingIssue) relatedIssuesToUpdate.add(event.blockingIssue.number);
                            break;
                        case 'BlockingAddedEvent':
                        case 'BlockingRemovedEvent':
                            if (event.blockedIssue) relatedIssuesToUpdate.add(event.blockedIssue.number);
                            break;
                    }
                });
            }
        });

        // Remove issues that were already updated in the main loop
        allIssues.forEach(issue => relatedIssuesToUpdate.delete(issue.number));

        if (relatedIssuesToUpdate.size > 0) {
            logger.info(`🔄 Force-updating ${relatedIssuesToUpdate.size} related issues due to relationship activity...`);
            const refetchStats = await this.refetchIssuesByNumber([...relatedIssuesToUpdate], newMetadata, indexMutations);
            stats.pulled.count   += refetchStats.refetched.count;
            stats.pulled.updated += refetchStats.refetched.count;
            stats.pulled.issues.push(...refetchStats.refetched.issues);
        }

        try {
            await updateContentIndex(issueSyncConfig, indexMutations);
        } catch (e) {
            logger.warn(`⚠️ Could not update _index.json for issues: ${e.message}`);
        }

        return { newMetadata, stats };
    }

    /**
     * @summary Force-refetches the given issues from GitHub and rewrites their local markdown.
     *
     * Bypasses the delta-sync `updatedAt` gate. Use this when the local file is known to have
     * drifted from GitHub for reasons that do NOT bump `issue.updatedAt`:
     *   - `timelineItems` truncation (the original cap-related divergence — see #10090)
     *   - Comment deletions (GitHub does not update `updatedAt` on delete)
     *   - Relationship events (sub-issue/blocking edges) when both sides are outside the delta window
     *
     * This method is the single recovery primitive: it fetches each issue via `FETCH_SINGLE_ISSUE`,
     * exhausts the full timelineItems connection via `#exhaustTimelineItems`, re-renders markdown,
     * writes the file, and mutates the passed `metadata` in place. Caller is responsible for
     * persisting metadata afterwards.
     *
     * The internal pullFromGitHub's related-issue force-update loop delegates here, and the
     * `ai/scripts/detectTruncatedTimelines.mjs` recovery step invokes it via GH_SyncService.
     *
     * @param {Array<number>|Set<number>} numbers The issue numbers to refetch.
     * @param {object} metadata The sync metadata object (mutated in place).
     * @param {object} [indexMutations=null] Optional accumulator for _index.json updates
     * @returns {Promise<{refetched: {count: number, issues: number[]}, errors: Array<{issueNumber: number, error: string}>}>}
     */
    async refetchIssuesByNumber(numbers, metadata, indexMutations = null) {
        const stats = {refetched: {count: 0, issues: []}, errors: []};
        const list  = [...numbers];

        for (const issueNumber of list) {
            try {
                const data = await GraphqlService.query(
                    FETCH_SINGLE_ISSUE,
                    {
                        owner           : aiConfig.owner,
                        repo            : aiConfig.repo,
                        number          : issueNumber,
                        maxLabels       : issueSyncConfig.maxLabelsPerIssue,
                        maxAssignees    : issueSyncConfig.maxAssigneesPerIssue,
                        maxSubIssues    : issueSyncConfig.maxSubIssuesPerIssue,
                        maxTimelineItems: issueSyncConfig.maxTimelineItemsPerIssue
                    },
                    true
                );

                const issue = data.repository.issue;
                if (!issue) {
                    logger.warn(`Issue #${issueNumber} not found on GitHub, skipping refetch`);
                    continue;
                }

                await this.#exhaustTimelineItems(issue);

                const planBuckets = this.#planBuckets(metadata, [issue]);
                const targetPath = this.#getIssuePath(issue, planBuckets);
                if (!targetPath) {
                    if (indexMutations) {
                        indexMutations.remove.push({ type: 'issues', id: issueNumber });
                    }
                    continue;
                }

                const markdown    = this.#formatIssueMarkdown(issue);
                const contentHash = this.#calculateContentHash(markdown);

                await fs.mkdir(path.dirname(targetPath), {recursive: true});
                await fs.writeFile(targetPath, markdown, 'utf-8');

                stats.refetched.count++;
                stats.refetched.issues.push(issueNumber);
                logger.debug(`✅ Refetched issue #${issueNumber}`);

                metadata.issues[issueNumber] = {
                    state        : issue.state,
                    path         : this.#relativePath(targetPath),
                    updatedAt    : issue.updatedAt,
                    closedAt     : issue.closedAt || null,
                    milestone    : issue.milestone?.title || null,
                    title        : issue.title,
                    contentHash,
                    commentsTotal: this.#countTimelineComments(issue) // Derived from the exhausted timeline — #10110
                };

                if (indexMutations) {
                    const plan = planBuckets.get(issueNumber);
                    indexMutations.upsert.push(createContentIndexEntry({
                        issueSyncConfig,
                        type: 'issues',
                        id: issueNumber,
                        filePath: this.#resolvePath(this.#relativePath(targetPath)),
                        itemIndex: plan ? plan.itemIndex : issueNumber,
                        version: issue.state === 'OPEN' ? null : plan?.version || null,
                        bucket: null
                    }));
                }
            } catch (e) {
                logger.error(`Failed to refetch issue #${issueNumber}: ${e.message}`);
                stats.errors.push({issueNumber, error: e.message});
            }
        }

        return stats;
    }

    /**
     * Pushes local changes to GitHub using GraphQL mutations.
     * Uses content hash comparison to detect actual changes and prevent false updates.
     * @param {object} metadata
     * @returns {Promise<object>}
     */
    async pushToGitHub(metadata) {
        logger.info('📤 Checking for local changes to push via GraphQL...');
        const stats = { count: 0, issues: [], failures: [] };

        if (!metadata.lastSync) {
            logger.info('✨ No previous sync found, skipping push.');
            return stats;
        }

        const localFiles       = await this.#scanLocalFiles();
        const previousFailures = metadata.pushFailures || [];

        logger.debug(`Scanning ${localFiles.length} local files for changes...`);

        for (const filePath of localFiles) {
            try {
                const content     = await fs.readFile(filePath, 'utf-8');
                const parsed      = matter(content);
                const issueNumber = parsed.data.id;

                if (!issueNumber) {
                    logger.debug(`Skipping file without issue number: ${path.basename(filePath)}`);
                    continue;
                }

                // Calculate current content hash
                const currentHash = this.#calculateContentHash(content);
                const oldIssue    = metadata.issues[issueNumber];

                // Skip if no metadata exists (shouldn't happen, but be safe)
                if (!oldIssue) {
                    logger.debug(`No metadata for #${issueNumber}, skipping push`);
                    continue;
                }

                // Compare content hash - skip if unchanged
                if (oldIssue.contentHash && oldIssue.contentHash === currentHash) {
                    logger.debug(`No content change for #${issueNumber}, skipping`);
                    continue;
                }

                // Skip previously failed pushes
                if (previousFailures.includes(issueNumber)) {
                    logger.debug(`Skipping previously failed push for issue #${issueNumber}`);
                    stats.failures.push(issueNumber);
                    continue;
                }

                logger.debug(`📝 Content changed for #${issueNumber}`);

                // Step 1: Get the issue's GraphQL ID
                const idData = await GraphqlService.query(GET_ISSUE_ID, {
                    owner : aiConfig.owner,
                    repo  : aiConfig.repo,
                    number: issueNumber
                });

                const issueId = idData.repository.issue.id;

                // Step 2: Prepare the updated content
                // Remove Timeline section and everything after it
                // This prevents the read-only timeline from being pushed back to the issue body
                const bodyContent = parsed.content.split('## Timeline')[0].trim();

                // Extract title from the markdown
                const titleMatch = bodyContent.match(/^#\s+(.+)$/m);
                const title      = titleMatch ? titleMatch[1] : parsed.data.title;

                // Remove only the title from body
                const cleanBody = bodyContent
                    .replace(/^#\s+.+$/m, '') // Remove title
                    .trim();

                // Step 3: Execute the mutation
                await GraphqlService.query(UPDATE_ISSUE, {
                    issueId,
                    title,
                    body: cleanBody
                });

                logger.debug(`✅ Updated GitHub issue #${issueNumber} via GraphQL`);
                stats.count++;
                stats.issues.push(issueNumber);
            } catch (e) {
                logger.warn(`⚠️ Could not push changes for file ${path.basename(filePath)}. Error: ${e.message}`);
                const parsed = matter(await fs.readFile(filePath, 'utf-8'));
                if (parsed.data.id) {
                    stats.failures.push(parsed.data.id);
                }
            }
        }

        if (stats.count > 0) {
            logger.info(`📤 Pushed ${stats.count} local change(s) to GitHub`);
        }
        if (stats.failures.length > 0) {
            logger.warn(`⚠️ Encountered ${stats.failures.length} push failure(s).`);
        }

        return stats;
    }

    /**
     * Reconciles the locations of closed issues in the active directory.
     * This handles the case where a new release is created but issues weren't updated,
     * so they didn't get moved during the pull operation (delta sync limitation).
     *
     * CRITICAL: This method ONLY processes issues that are:
     * 1. Currently in the active issues directory (not already archived)
     * 2. In a CLOSED state
     * 3. Should be archived based on milestone or release date
     * @param {object} metadata The current metadata object
     * @returns {Promise<object>} Stats about reconciled issues
     */
    async reconcileClosedIssueLocations(metadata) {
        logger.info('🔄 Reconciling closed issue locations...');

        const stats = { count: 0, issues: [] };

        // Ensure releases are loaded
        if (!ReleaseNotesSyncer.sortedReleases || ReleaseNotesSyncer.sortedReleases.length === 0) {
            logger.warn('No releases available for reconciliation, skipping.');
            return stats;
        }

        for (const issueNumber in metadata.issues) {
            const issueData = metadata.issues[issueNumber];

            // CRITICAL: Only process issues in the active directory
            // Resolve path to absolute for checking location
            const currentAbsolutePath = this.#resolvePath(issueData.path);

            if (!currentAbsolutePath || !currentAbsolutePath.startsWith(issueSyncConfig.issuesDir)) {
                continue; // Already archived, skip it
            }

            // Only process CLOSED issues
            if (issueData.state !== 'CLOSED') {
                continue;
            }

            // Calculate where this closed issue SHOULD be
            const planBuckets = this.#planBuckets(metadata);
            const correctPath = this.#getIssuePath({
                number   : parseInt(issueNumber),
                state    : issueData.state,
                milestone: issueData.milestone ? { title: issueData.milestone } : null,
                closedAt : issueData.closedAt,
                updatedAt: issueData.updatedAt
            }, planBuckets);

            // If the correct path is null, the issue should be dropped (shouldn't happen here)
            if (!correctPath) {
                logger.warn(`Issue #${issueNumber} has null target path during reconciliation, skipping.`);
                continue;
            }

            // Check if the issue needs to be moved to an archive
            if (currentAbsolutePath !== correctPath) {
                // Verify the correct path is actually in an archive, not back to active directory
                if (correctPath.startsWith(issueSyncConfig.issuesDir)) {
                    logger.debug(`Issue #${issueNumber} correct path is still in active directory, no move needed.`);
                    continue;
                }

                logger.debug(`📦 Archiving closed issue #${issueNumber}: ${currentAbsolutePath} → ${correctPath}`);

                try {
                    // Ensure target directory exists
                    await fs.mkdir(path.dirname(correctPath), { recursive: true });

                    // Move the file
                    await fs.rename(currentAbsolutePath, correctPath);

                    // Update metadata with relative path
                    metadata.issues[issueNumber].path = this.#relativePath(correctPath);

                    stats.count++;
                    stats.issues.push(parseInt(issueNumber));

                    logger.debug(`✅ Archived #${issueNumber} to ${path.relative(process.cwd(), correctPath)}`);
                } catch (e) {
                    logger.error(`❌ Failed to archive #${issueNumber}: ${e.message}`);
                }
            }
        }

        if (stats.count > 0) {
            logger.info(`📦 Archived ${stats.count} closed issue(s)`);
        } else {
            logger.info('✓ No closed issues need archiving');
        }

        return stats;
    }

    /**
     * Recursively scans the configured issue directory to find all local .md issue files.
     * This operation is intentionally limited to the active issues directory as a performance
     * optimization, based on the assumption that closed/archived issues are immutable and
     * do not need to be checked for local changes to push.
     * @returns {Promise<string[]>} A flat list of absolute file paths for all found issue files.
     * @private
     */
    async #scanLocalFiles() {
        const localFiles = [];
        const scanDir = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await scanDir(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.md')) {
                        localFiles.push(fullPath);
                    }
                }
            } catch (e) {
                // Directory doesn't exist yet, which is fine.
            }
        };

        await scanDir(issueSyncConfig.issuesDir);

        return localFiles;
    }
}

export default Neo.setupClass(IssueSyncer);
