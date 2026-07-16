import aiConfig                                                                       from '../../../mcp/server/github-workflow/config.mjs';
import Base                                                                           from '../../../../src/core/Base.mjs';
import crypto                                                                         from 'crypto';
import {existsSync}                                                                   from 'fs';
import fs                                                                             from 'fs/promises';
import logger                                                                         from '../../../mcp/server/github-workflow/logger.mjs';
import matter                                                                         from 'gray-matter';
import path                                                                           from 'path';
import semver                                                                         from 'semver';
import GraphqlService                                                                 from '../GraphqlService.mjs';
import ReleaseNotesSyncer                                                             from './ReleaseNotesSyncer.mjs';
import {FETCH_PULL_REQUESTS_FOR_SYNC, FETCH_SINGLE_PULL_FOR_SYNC}                     from '../queries/pullRequestQueries.mjs';
import contentPath                                                                    from '../shared/contentPath.mjs';
import {createContentIndexEntry, createContentIndexEntryFromPath, updateContentIndex} from '../shared/contentIndex.mjs';
import {createContentTrustSummary, projectAuthoredNodeTrust}                          from '../shared/conversationTrust.mjs';
import pruneEmptyDirs                                                                 from '../shared/pruneEmptyDirs.mjs';

const issueSyncConfig   = aiConfig.issueSync;
const pullRequestConfig = aiConfig.pullRequest;

/**
 * @summary Handles the fetching and local synchronization of GitHub Pull Requests.
 *
 * This service is responsible for:
 * - Fetching pull requests from GitHub via GraphQL.
 * - Generating and updating local Markdown files for each pull request.
 * - Supporting offline context mapping.
 *
 * @class Neo.ai.services.github-workflow.sync.PullRequestSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.sync.PullRequestSyncer'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.sync.PullRequestSyncer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

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
     * @summary Resolves a closed or merged pull request's release-date bucket.
     * @param {Object} pr GitHub pull request node or cached pull entry.
     * @returns {String|null} Version bucket, or null when no cut release follows the close/merge date.
     * @private
     */
    #deriveClosedAtVersion(pr) {
        if (!pr.mergedAt && !pr.closedAt) return null;

        const closed  = new Date(pr.mergedAt || pr.closedAt);
        const release = (ReleaseNotesSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);

        if (!release) return null;

        return release.tagName.startsWith(issueSyncConfig.versionDirectoryPrefix)
            ? release.tagName
            : issueSyncConfig.versionDirectoryPrefix + release.tagName;
    }

    /**
     * @summary Resolves an opt-in milestone archive bucket without pre-staging future releases.
     * @param {Object} pr GitHub pull request node or cached pull entry.
     * @returns {String|null} Existing milestone bucket, or null when disabled, invalid, or uncut.
     * @private
     */
    #deriveMilestoneVersion(pr) {
        const title = pr.milestone?.title;

        if (!issueSyncConfig.routeByMilestone || !title || !semver.valid(semver.clean(title))) {
            return null;
        }

        const candidate = title.startsWith(issueSyncConfig.versionDirectoryPrefix)
            ? title
            : issueSyncConfig.versionDirectoryPrefix + title;
        const archiveDir = path.join(issueSyncConfig.archiveRoot, 'pulls', candidate);

        return existsSync(archiveDir) ? candidate : null;
    }

    /**
     * Resolves a path to an absolute path against the project root.
     * @param {string} p The path to resolve.
     * @returns {string|null} The absolute path.
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
     * @returns {string|null} The relative path.
     * @private
     */
    #relativePath(p) {
        if (!p) return null;
        return path.relative(aiConfig.projectRoot, p);
    }

    /**
     * @summary Projects one GitHub-authored pull-request sync node through content trust policy.
     * @param {Object} node GitHub authored node carrying optional `author.login` and `body`.
     * @param {Object} summary Machine-readable content-trust summary accumulator.
     * @param {String} signalPath Stable path label for sanitizer signal metadata.
     * @returns {Object} Projected node with sanitized body for untrusted authors.
     * @private
     */
    #projectAuthoredNode(node, summary, signalPath) {
        return projectAuthoredNodeTrust(node, {
            summary,
            path               : signalPath,
            productNameDenylist: issueSyncConfig.productNameDenylist || []
        }).node;
    }

    /**
     * @summary Pre-computes bucket distribution for all pull requests based on historical milestones/releases.
     * @param {object} metadata Current sync metadata
     * @param {Array<object>} fetchedPullRequests PRs fetched in the current sync run
     * @returns {Map<number, {version: string|null, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planBuckets(metadata, fetchedPullRequests = []) {
        const combined = new Map();

        for (const [idStr, pr] of Object.entries(metadata.pulls || {})) {
            combined.set(parseInt(idStr, 10), {
                number   : parseInt(idStr, 10),
                state    : pr.state,
                milestone: pr.milestone ? { title: pr.milestone } : null,
                closedAt : pr.closedAt,
                mergedAt : pr.mergedAt
            });
        }

        for (const pr of fetchedPullRequests) {
            combined.set(pr.number, {
                number   : pr.number,
                state    : pr.state,
                milestone: pr.milestone,
                closedAt : pr.closedAt,
                mergedAt : pr.mergedAt
            });
        }

        const buckets     = new Map();
        const activeItems = [];

        for (const pr of combined.values()) {
            let version = null;
            if (pr.mergedAt || pr.closedAt) {
                version = this.#deriveClosedAtVersion(pr);
            }

            if (!version) {
                version = this.#deriveMilestoneVersion(pr);
            }

            if (pr.state !== 'CLOSED' && pr.state !== 'MERGED' || !version) {
                activeItems.push(pr);
                continue;
            }

            if (!buckets.has(version)) buckets.set(version, []);
            buckets.get(version).push(pr);
        }

        const plans = new Map();

        activeItems.sort((a, b) => a.number - b.number);
        const activeItemCount = activeItems.length;
        activeItems.forEach((pr, index) => {
            plans.set(pr.number, {
                version  : null,
                itemCount: activeItemCount,
                itemIndex: index
            });
        });

        for (const [version, prs] of buckets.entries()) {
            prs.sort((a, b) => a.number - b.number);
            const itemCount = prs.length;
            prs.forEach((pr, index) => {
                plans.set(pr.number, {
                    version,
                    itemCount,
                    itemIndex: index
                });
            });
        }

        return plans;
    }

    /**
     * Determines the correct local file path for a given pull request based on its state.
     * @param {object} pr The GitHub pull request object.
     * @param {Map<number, object>} planBuckets Precomputed bucket distribution.
     * @returns {string} The absolute file path for the PR's Markdown file.
     * @private
     */
    #getPullRequestPath(pr, planBuckets = new Map()) {
        const filename = `${aiConfig.issueSync.pullFilenamePrefix || 'pr-'}${pr.number}.md`;

        const plan = planBuckets.get(pr.number);

        const config = {
            contentRoot  : issueSyncConfig.contentRoot,
            type         : 'pulls',
            filename,
            itemIndex    : plan?.itemIndex || 0,
            itemsPerChunk: issueSyncConfig.archiveChunkThreshold,
            chunkPrefix  : issueSyncConfig.archiveChunkPrefix
        };

        if (plan?.version) {
            config.version = plan.version;
        }

        return contentPath(config);
    }

    /**
     * @summary Reconcile closed/merged pull-request locations — archive any terminal PR still sitting in
     * the active `pulls/` directory. The sibling of `IssueSyncer.reconcileClosedIssueLocations` that was
     * missing: `SyncService` ran the issue reconcile every sync but had no pull equivalent, so
     * closed/merged PRs accumulated in active `resources/content/pulls/` — the marooning this reconciles.
     * `migrateArchiveBuckets`' own JSDoc named it — "pulls … are a sibling follow-up on their own
     * syncers." Run every sync, it both archives the existing backlog and keeps pulls archived going
     * forward; it mirrors the issue reconcile's relocate-only, archive-only, never-fetch contract.
     *
     * It scans the active **corpus** (the `pr-*.md` files on disk), NOT the sync metadata: the delta-sync
     * rebuilds `metadata.pulls` from each run's delta fetch, so it is not a full index — the marooned
     * backlog exists only as files. For each terminal (`CLOSED`/`MERGED`) PR file it reads the frontmatter
     * bucketing inputs (`state` / `closedAt` / `mergedAt`), buckets via the same `#planBuckets` the live
     * sync uses, and `fs.rename`s a mis-located file to its archive path (updating the metadata path when
     * an entry exists). It NEVER moves a file back to active (sealed-chunk semantics), NEVER deletes, and
     * NEVER re-fetches from GitHub.
     *
     * A move and its `_index.json` upsert are ONE mutation set. The index is the id→path lookup every
     * reader resolves through, so a rename that does not carry its entry does not relocate a file —
     * it hides it: the artifact is fine, the lookup points at nothing, and no pass complains. Relying
     * on "the next sync rebuilds the index" does not save it either, because that rebuild only covers
     * the PRs in its own delta fetch, and a marooned backlog is precisely the set the delta never
     * names. Entries are derived from the path the file NOW occupies rather than from the plan that
     * chose it — a plan records intent, and intent is what goes stale.
     *
     * @param {object} metadata Sync metadata; a moved PR's `path` is updated in place when cached.
     * @returns {Promise<{count: number, pullRequests: number[], indexed: number}>} Archived count, the
     *     PR numbers moved, and the number of index entries realigned with them.
     */
    async reconcileClosedPullRequestLocations(metadata) {
        logger.info('🔄 Reconciling closed pull request locations...');

        const stats = { count: 0, pullRequests: [], indexed: 0 };

        // Buckets are derived from release history; without it the correct archive version is unknown.
        if (!ReleaseNotesSyncer.sortedReleases || ReleaseNotesSyncer.sortedReleases.length === 0) {
            logger.warn('No releases available for pull-request reconciliation, skipping.');
            return stats;
        }

        const pullsDir = issueSyncConfig.pullsDir;

        // Nothing to reconcile if the active pulls dir does not exist yet.
        if (!existsSync(pullsDir)) {
            return stats;
        }

        // Scan the active CORPUS (files on disk), NOT metadata.pulls — the delta-sync rebuilds that cache
        // from each run's delta fetch, so it is not a full index; the marooned backlog lives only as
        // files. Read each file's frontmatter for the bucketing inputs.
        const relFiles = (await fs.readdir(pullsDir, {recursive: true}))
            .filter(rel => /(?:^|[\\/])pr-\d+\.md$/.test(rel));

        const scanned = [];
        for (const rel of relFiles) {
            const absPath = path.join(pullsDir, rel);
            try {
                const {data} = matter(await fs.readFile(absPath, 'utf-8'));
                if (data?.number == null) continue;
                scanned.push({
                    absPath,
                    number   : data.number,
                    state    : data.state,
                    closedAt : data.closedAt,
                    mergedAt : data.mergedAt,
                    milestone: data.milestone ? {title: data.milestone} : null
                });
            } catch (e) {
                logger.warn(`Skipping unreadable pull file ${rel}: ${e.message}`);
            }
        }

        // Bucket the scanned corpus (+ any cached metadata) by release date, exactly as the live sync does.
        const planBuckets  = this.#planBuckets(metadata, scanned),
              indexUpserts = [];

        for (const pr of scanned) {
            // Only terminal PRs (CLOSED or MERGED) are archive candidates; an open PR belongs in active.
            if (pr.state !== 'CLOSED' && pr.state !== 'MERGED') {
                continue;
            }

            const correctPath = this.#getPullRequestPath({number: pr.number}, planBuckets);

            // No target, already correctly located, or the correct path is still active (no archive
            // applies) → skip. Never relocate INTO active.
            if (!correctPath || pr.absPath === correctPath || correctPath.startsWith(pullsDir)) {
                continue;
            }

            logger.debug(`📦 Archiving closed PR #${pr.number}: ${pr.absPath} → ${correctPath}`);

            try {
                await fs.mkdir(path.dirname(correctPath), { recursive: true });
                await fs.rename(pr.absPath, correctPath);

                // Derived from the destination, not the plan: the entry describes where the file is.
                indexUpserts.push(createContentIndexEntryFromPath({
                    issueSyncConfig,
                    type    : 'pulls',
                    id      : pr.number,
                    filePath: correctPath
                }));

                // Update the metadata path when this PR is tracked; marooned files outside the delta-only
                // cache simply move (the next sync rebuilds metadata against the new location).
                if (metadata.pulls?.[pr.number]) {
                    metadata.pulls[pr.number].path = this.#relativePath(correctPath);
                }

                stats.count++;
                stats.pullRequests.push(pr.number);
            } catch (e) {
                logger.error(`❌ Failed to archive PR #${pr.number}: ${e.message}`);
            }
        }

        // One write for the pass, after the moves that earned the entries. An upsert per rename would
        // re-read and re-sort the whole index once per file; batching keeps the pass linear.
        if (indexUpserts.length > 0) {
            try {
                await updateContentIndex(issueSyncConfig, {upsert: indexUpserts});
                stats.indexed = indexUpserts.length;
            } catch (e) {
                // Loud, and NOT swallowed into a success: the files have already moved, so a failed
                // index write leaves exactly the stale-lookup state this method exists to prevent.
                // The caller decides whether a corpus whose index is known-behind may be committed.
                logger.error(`❌ Archived ${indexUpserts.length} pull request(s) but could not update _index.json: ${e.message}`);
                throw e;
            }
        }

        await pruneEmptyDirs(pullsDir);

        logger.info(stats.count > 0
            ? `📦 Archived ${stats.count} closed pull request(s) (${stats.indexed} index entr${stats.indexed === 1 ? 'y' : 'ies'} realigned)`
            : '✓ No closed pull requests need archiving');

        return stats;
    }

    /**
     * @summary Renders a fetched PR node to its synced Markdown (frontmatter + body + comments + reviews),
     * applying the content-trust sanitizer to each authored node. Extracted from {@link #syncPullRequests}
     * so the single-PR force-refetch path renders identically (no drift between bulk-sync and refetch).
     * @param {Object} pr The PR node (with `comments.nodes` / `reviews.nodes`).
     * @returns {String} The gray-matter-serialized Markdown content.
     */
    #renderPullRequestMarkdown(pr) {
        const contentTrust = createContentTrustSummary();
        const projectedPr  = this.#projectAuthoredNode(pr, contentTrust, 'body');

        const frontmatter = {
            number   : pr.number,
            title    : pr.title,
            author   : pr.author?.login || 'unknown',
            state    : pr.state,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            closedAt : pr.closedAt,
            mergedAt : pr.mergedAt,
            head     : pr.headRefName,
            base     : pr.baseRefName,
            url      : pr.url,
            contentTrust
        };

        let body = projectedPr.body || '';

        // Build comments structure
        if (pr.comments && pr.comments.nodes && pr.comments.nodes.length > 0) {
            body += '\n\n## Comments\n\n';
            for (const comment of pr.comments.nodes) {
                const projectedComment = this.#projectAuthoredNode(
                    comment,
                    contentTrust,
                    `comment:${comment.id || comment.createdAt || 'unknown'}`
                );

                body += `### \`@${comment.author?.login || 'unknown'}\` commented on ${comment.createdAt}\n\n${projectedComment.body}\n\n---\n\n`;
            }
        }

        // Build reviews structure
        if (pr.reviews && pr.reviews.nodes && pr.reviews.nodes.length > 0) {
            body += '\n\n## Reviews\n\n';
            for (const review of pr.reviews.nodes) {
                const reviewState = review.state ? ` (${review.state})` : '';
                body += `### \`@${review.author?.login || 'unknown'}\`${reviewState} reviewed on ${review.createdAt}\n\n`;
                if (review.body && review.body.trim().length > 0) {
                    const projectedReview = this.#projectAuthoredNode(
                        review,
                        contentTrust,
                        `review:${review.id || review.createdAt || 'unknown'}`
                    );

                    body += `${projectedReview.body}\n\n`;
                } else {
                    body += `*No review body provided.*\n\n`;
                }
                body += `---\n\n`;
            }
        }

        // Gray-matter serialization
        return matter.stringify(body, frontmatter);
    }

    /**
     * Fetches pull requests from GitHub and syncs them to local markdown.
     * @param {object} metadata The sync metadata containing cached records.
     * @returns {Promise<object>} Statistics about the operation.
     */
    async syncPullRequests(metadata) {
        logger.info('🔄 Fetching pull requests from GitHub via GraphQL...');

        let allPullRequests = [];
        let hasNextPage     = true;
        let cursor          = null;

        // Delta cutoff. The `pullRequests` connection (unlike `issues`) has no server-side `since`
        // filter, so the query orders UPDATED_AT DESC and we stop paginating once a batch's oldest PR
        // predates the cached high-water mark. A clean-slate run (lastSync === null) or an empty cache
        // traverses the full history. Mirrors the issue delta semantics — the dominant rate-limit win.
        const cachedPrDates = Object.values(metadata.pulls || {})
            .map(p => Date.parse(p.updatedAt)).filter(t => !isNaN(t));
        const sinceCutoff = (metadata.lastSync == null || cachedPrDates.length === 0)
            ? 0
            : cachedPrDates.reduce((max, t) => t > max ? t : max, 0);

        // Ensure directory exists
        await fs.mkdir(issueSyncConfig.pullsDir, { recursive: true });

        while (hasNextPage) {
            const data = await GraphqlService.query(FETCH_PULL_REQUESTS_FOR_SYNC, {
                owner      : aiConfig.owner,
                repo       : aiConfig.repo,
                limit      : pullRequestConfig.defaults.limit || 30,
                cursor,
                states     : ['OPEN', 'CLOSED', 'MERGED'],
                maxComments: pullRequestConfig.maxCommentsPerPullRequest || 50,
                maxReviews : 20
            });

            const pullRequests = data.repository.pullRequests;

            if (pullRequests.nodes.length === 0) {
                break;
            }

            allPullRequests.push(...pullRequests.nodes);

            // Stop once the oldest PR in this UPDATED_AT-DESC batch predates the cutoff — everything
            // beyond is already current (re-processed in-window items no-op via the content-hash skip).
            const oldestPr = pullRequests.nodes[pullRequests.nodes.length - 1];
            if (Date.parse(oldestPr.updatedAt) < sinceCutoff) break;

            hasNextPage = pullRequests.pageInfo.hasNextPage;
            cursor      = pullRequests.pageInfo.endCursor;
        }

        const stats = {
            count : 0,
            synced: []
        };

        const cachedPulls          = metadata.pulls || {};
        const planBuckets          = this.#planBuckets(metadata, allPullRequests);
        let   shouldPruneEmptyDirs = false;

        for (const pr of allPullRequests) {
            try {
                const targetPath  = this.#getPullRequestPath(pr, planBuckets);
                const content     = this.#renderPullRequestMarkdown(pr);
                const currentHash = this.#calculateContentHash(content);

                const cachedPull      = cachedPulls[pr.number];
                const oldPathRelative = cachedPull?.path;
                const oldAbsolutePath = oldPathRelative ? this.#resolvePath(oldPathRelative) : null;

                const needsUpdate = !cachedPull ||
                    cachedPull.updatedAt !== pr.updatedAt ||
                    oldAbsolutePath !== targetPath;

                // Diff cache
                if (!needsUpdate && cachedPull && cachedPull.contentHash === currentHash) {
                    logger.debug(`Skipping pull request #${pr.number}, content unchanged.`);

                    // We must still transfer the hash and path to the new run's metadata to persist it
                    pr.contentHash = currentHash;
                    pr.relativeOutputPath = oldPathRelative;
                    continue;
                }

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, content, 'utf-8');

                if (oldAbsolutePath && oldAbsolutePath !== targetPath) {
                    try {
                        await fs.unlink(oldAbsolutePath);
                        shouldPruneEmptyDirs = true;
                        logger.debug(`📦 Moved PR #${pr.number}: ${oldAbsolutePath} → ${targetPath}`);
                    } catch (e) {
                        // File might not exist
                    }
                }

                logger.debug(`✅ Synced pull request #${pr.number}`);

                pr.contentHash = currentHash;
                pr.relativeOutputPath = this.#relativePath(targetPath);

                stats.count++;
                stats.synced.push(pr.number);
            } catch (e) {
                logger.warn(`⚠️ Could not sync pull request #${pr.number}: ${e.message}`);
            }
        }

        await pruneEmptyDirs(issueSyncConfig.pullsDir);
        if (shouldPruneEmptyDirs) {
            await pruneEmptyDirs(path.join(issueSyncConfig.archiveRoot, 'pulls'));
        }

        // Cache for the main orchestrator to merge
        metadata.pulls = {};
        const indexEntries = [];

        allPullRequests.forEach(p => {
            const plan = planBuckets.get(p.number);

            metadata.pulls[p.number] = {
                number     : p.number,
                contentHash: p.contentHash,
                state      : p.state,
                updatedAt  : p.updatedAt,
                closedAt   : p.closedAt || null,
                mergedAt   : p.mergedAt || null,
                milestone  : p.milestone?.title || null,
                path       : p.relativeOutputPath
            };

            indexEntries.push(createContentIndexEntry({
                issueSyncConfig,
                type     : 'pulls',
                id       : p.number,
                filePath : path.resolve(aiConfig.projectRoot, p.relativeOutputPath),
                itemIndex: plan ? plan.itemIndex : 0,
                version  : p.state === 'OPEN' ? null : plan?.version || null,
                bucket   : null
            }));
        });

        try {
            await updateContentIndex(issueSyncConfig, {upsert: indexEntries});
        } catch (e) {
            logger.warn(`⚠️ Could not update _index.json for pull requests: ${e.message}`);
        }

        if (stats.count > 0) {
            logger.info(`✨ Synced ${stats.count} modified pull requests to disk.`);
        } else {
            logger.info(`✅ Synced 0 pull requests (all up to date).`);
        }

        return stats;
    }

    /**
     * @summary Force-refetches specific pull requests from GitHub, bypassing the delta-by-`updatedAt`
     * gate, and re-renders their local Markdown mirrors from current GitHub state.
     *
     * The bulk {@link #syncPullRequests} path is delta-gated (it stops paginating past the cached
     * high-water mark) and PR mirrors are pull-only, so a mirror that drifted for a reason that does
     * NOT bump `updatedAt` (e.g. an upstream body edit on an already-synced closed PR) is never
     * re-pulled. This is the single recovery primitive: it fetches each PR via
     * {@link FETCH_SINGLE_PULL_FOR_SYNC}, re-renders via {@link #renderPullRequestMarkdown}, writes the
     * file, and mutates the passed `metadata` in place. The caller persists metadata afterwards.
     * Mirrors `IssueSyncer#refetchIssuesByNumber`.
     *
     * @param {Array<Number>|Set<Number>} numbers The pull-request numbers to refetch.
     * @param {Object} metadata The sync metadata object (mutated in place).
     * @param {Object} [indexMutations=null] Optional accumulator for `_index.json` updates.
     * @returns {Promise<{refetched: {count: Number, pulls: Number[]}, errors: Array<{prNumber: Number, error: String}>}>}
     */
    async refetchPullsByNumber(numbers, metadata, indexMutations = null) {
        const stats = {refetched: {count: 0, pulls: []}, errors: []};
        const list  = [...numbers];

        for (const prNumber of list) {
            try {
                const data = await GraphqlService.query(
                    FETCH_SINGLE_PULL_FOR_SYNC,
                    {
                        owner      : aiConfig.owner,
                        repo       : aiConfig.repo,
                        prNumber,
                        maxComments: pullRequestConfig.maxCommentsPerPullRequest || 50,
                        maxReviews : 20
                    },
                    true
                );

                const pr = data.repository.pullRequest;
                if (!pr) {
                    logger.warn(`Pull request #${prNumber} not found on GitHub, skipping refetch`);
                    continue;
                }

                const planBuckets = this.#planBuckets(metadata, [pr]);
                const targetPath  = this.#getPullRequestPath(pr, planBuckets);
                if (!targetPath) {
                    if (indexMutations) {
                        indexMutations.remove.push({type: 'pulls', id: prNumber});
                    }
                    continue;
                }

                const content     = this.#renderPullRequestMarkdown(pr);
                const contentHash = this.#calculateContentHash(content);

                await fs.mkdir(path.dirname(targetPath), {recursive: true});
                await fs.writeFile(targetPath, content, 'utf-8');

                stats.refetched.count++;
                stats.refetched.pulls.push(prNumber);
                logger.debug(`✅ Refetched pull request #${prNumber}`);

                metadata.pulls[prNumber] = {
                    number   : pr.number,
                    contentHash,
                    state    : pr.state,
                    updatedAt: pr.updatedAt,
                    closedAt : pr.closedAt || null,
                    mergedAt : pr.mergedAt || null,
                    milestone: pr.milestone?.title || null,
                    path     : this.#relativePath(targetPath)
                };

                if (indexMutations) {
                    const plan = planBuckets.get(prNumber);
                    indexMutations.upsert.push(createContentIndexEntry({
                        issueSyncConfig,
                        type     : 'pulls',
                        id       : prNumber,
                        filePath : this.#resolvePath(this.#relativePath(targetPath)),
                        itemIndex: plan ? plan.itemIndex : 0,
                        version  : pr.state === 'OPEN' ? null : plan?.version || null,
                        bucket   : null
                    }));
                }
            } catch (e) {
                logger.error(`Failed to refetch pull request #${prNumber}: ${e.message}`);
                stats.errors.push({prNumber, error: e.message});
            }
        }

        return stats;
    }
}

export default Neo.setupClass(PullRequestSyncer);
