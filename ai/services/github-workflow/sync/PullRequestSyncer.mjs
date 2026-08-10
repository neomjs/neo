import aiConfig                                                                   from '../../../mcp/server/github-workflow/config.mjs';
import Base                                                                       from '../../../../src/core/Base.mjs';
import crypto                                                                     from 'crypto';
import {writeFileAtomic}                                                          from '../../shared/atomicFileWrite.mjs';
import {existsSync}                                                               from 'fs';
import fs                                                                         from 'fs/promises';
import logger                                                                     from '../../../mcp/server/github-workflow/logger.mjs';
import matter                                                                     from 'gray-matter';
import path                                                                       from 'path';
import semver                                                                     from 'semver';
import GraphqlService                                                             from '../GraphqlService.mjs';
import ReleaseNotesSyncer                                                         from './ReleaseNotesSyncer.mjs';
import {FETCH_PULL_REQUESTS_FOR_SYNC, FETCH_SINGLE_PULL_FOR_SYNC}                 from '../queries/pullRequestQueries.mjs';
import contentPath, {parseContentPath, pathSegmentOptionsFor}                     from '../shared/contentPath.mjs';
import {buildContentInventory, resolveArchivedLocation, validateContentIntegrity} from '../shared/contentInventory.mjs';
import {createContentIndexEntryFromPath, readContentIndex, updateContentIndex}    from '../shared/contentIndex.mjs';
import {createContentTrustSummary, projectAuthoredNodeTrust}                      from '../shared/conversationTrust.mjs';
import pruneEmptyDirs                                                             from '../shared/pruneEmptyDirs.mjs';

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
     *
     * The ordinal is defined against COMPLETE bucket membership, and neither input carries it:
     * `metadata.pulls` is rebuilt from each run's delta fetch and `fetchedPullRequests` is that delta.
     * Ranking a PR against the handful of its bucket a delta happens to include does not produce a
     * roughly-right chunk, it produces a confidently wrong one — and the sync then writes there.
     * Passing `inventory` seeds each bucket with the ids already on disk in it, which is the only
     * complete membership that exists, because the files outlive every cache describing them.
     *
     * @param {object} metadata Current sync metadata
     * @param {Array<object>} fetchedPullRequests PRs fetched in the current sync run
     * @param {Map<number, Array<object>>} [inventory] Complete corpus inventory. Omitted, buckets are
     *     ranked against the delta alone — correct only when the delta IS the corpus.
     * @returns {Map<number, {version: string|null, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planBuckets(metadata, fetchedPullRequests = [], inventory = null) {
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

        // Keyed by number so a bucket cannot hold an id twice — a duplicate would consume an ordinal
        // slot and shift every later member's chunk by one.
        const buckets     = new Map();
        const activeItems = [];

        const addToBucket = (version, number, pr = null) => {
            if (!buckets.has(version)) buckets.set(version, new Map());

            const bucket = buckets.get(version);

            // A seeded id carries only its number; a classified PR carries its node. Never let the
            // seed overwrite the richer entry.
            if (pr || !bucket.has(number)) bucket.set(number, pr || {number});
        };

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

            addToBucket(version, pr.number, pr);
        }

        // Seed from disk AFTER classification, and never for an id this run already classified. An
        // open PR with a stray archived artifact is corruption; seeding it would hand that PR an
        // archive plan and the sync would seal a live PR away. Membership is inherited from the
        // corpus only for ids this run has no live opinion about — which is the whole marooned
        // backlog.
        //
        // BOTH tiers. Seeding only the versioned buckets left the active collection ranking a PR
        // against the delta alone — the same partial-ordinal defect this exists to remove, one tier
        // over, and invisible because the archive half looked fixed. An active file is a member of
        // the active collection exactly as an archived file is a member of its bucket; both ordinals
        // are defined over complete membership.
        if (inventory) {
            const classified = new Set(activeItems.map(pr => pr.number));

            for (const bucket of buckets.values()) {
                for (const id of bucket.keys()) classified.add(id);
            }

            for (const [id, copies] of inventory) {
                if (classified.has(id)) continue;

                const archived = copies.find(copy => copy.version);

                archived ? addToBucket(archived.version, id) : activeItems.push({number: id});
            }
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

        for (const [version, bucket] of buckets.entries()) {
            const prs       = [...bucket.values()].sort((a, b) => a.number - b.number),
                  itemCount = prs.length;

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
     *
     * An already-archived PR keeps the artifact it owns. Archive ordinals are fixed when a bucket is
     * cut, so recomputing one at refresh time answers a different question than the one that placed
     * the file: the planner ranks the PR against the PRs it can currently see, and a delta-sized view
     * of a sealed bucket yields a different chunk. The write then lands beside the existing copy
     * rather than on it, and the two renderings diverge from that moment on. Reusing the occupied
     * location makes a refresh overwrite the file that exists — a second copy becomes unreachable by
     * construction rather than merely unlikely.
     *
     * @param {object} pr The GitHub pull request object.
     * @param {Map<number, object>} planBuckets Precomputed bucket distribution.
     * @param {Map<number, Array<object>>} [inventory] Complete corpus inventory; enables the
     *     preserve-existing rule. Omitted, placement falls back to the plan alone.
     * @returns {string} The absolute file path for the PR's Markdown file.
     * @throws {Error} When the PR already owns more than one archived artifact.
     * @private
     */
    #getPullRequestPath(pr, planBuckets = new Map(), inventory = null) {
        const filename = `${aiConfig.issueSync.pullFilenamePrefix || 'pr-'}${pr.number}.md`;

        const plan = planBuckets.get(pr.number);

        // Terminal only. An OPEN pull request belongs in active regardless of what sits in the
        // archive — an open PR with an archived artifact is itself corruption, and preserving that
        // location would keep a live PR sealed away where the next refresh can never surface it.
        // Mirrors the reconcile's archive-candidate rule.
        const isTerminal = pr.state === 'CLOSED' || pr.state === 'MERGED';

        if (inventory && isTerminal) {
            const archived = resolveArchivedLocation(inventory, pr.number);

            // Two artifacts for one id: the corpus is already corrupt here and nothing on disk says
            // which copy is current. Refuse this PR rather than pick — writing to either would
            // canonicalise a guess and destroy the evidence of the divergence. The per-PR catch in
            // the sync loop turns this into a skip, so one corrupt id cannot wedge the run, and the
            // integrity pass reports it for repair from source.
            if (archived.status === 'ambiguous') {
                throw new Error(
                    `pull request #${pr.number} owns ${archived.copies.length} archived artifacts ` +
                    `(${archived.copies.map(copy => copy.absPath).join(', ')}) — refusing to guess which is current`
                );
            }

            if (archived.status === 'unique') {
                return archived.entry.absPath;
            }
        }

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
     * @returns {Promise<{count: number, pullRequests: number[], indexed: number, collisions: number[]}>}
     *     Archived count, the PR numbers moved, the number of index entries realigned with them, and
     *     the ids left in place because an artifact already occupied their destination.
     */
    async reconcileClosedPullRequestLocations(metadata) {
        logger.info('🔄 Reconciling closed pull request locations...');

        const stats = { count: 0, pullRequests: [], indexed: 0, collisions: [] };

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

        // Bucket the scanned corpus (+ any cached metadata) by release date, exactly as the live sync
        // does — and against the same complete membership, so a file moved here lands on the ordinal
        // the full bucket ordering chooses rather than one derived from this pass's view of it.
        const inventory = await buildContentInventory(issueSyncConfig, {
            type      : 'pulls',
            filePrefix: aiConfig.issueSync.pullFilenamePrefix || 'pr-'
        });
        const planBuckets  = this.#planBuckets(metadata, scanned, inventory),
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

            // `fs.rename` silently replaces its destination. A same-id artifact already sitting at
            // `correctPath` means this PR owns two copies, and renaming over it would destroy one —
            // specifically the archived one, which is the divergent evidence the duplicate repair
            // exists to arbitrate from source. This pass runs BEFORE that repair, so an unguarded
            // rename lets the relocate step quietly resolve a duplicate by deletion, which is the
            // one resolution this lane refuses. Leave both; the integrity pass reports the id and
            // `repairDuplicateArtifacts` restores it from GitHub.
            if (existsSync(correctPath)) {
                logger.warn(`⚠️ PR #${pr.number} already has an artifact at ${correctPath} — leaving both in place for duplicate repair rather than renaming over it.`);
                stats.collisions.push(pr.number);
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

        const cachedPulls = metadata.pulls || {};
        // The corpus, not the cache. `metadata.pulls` is rebuilt from this run's delta, so it cannot
        // answer "where does PR N already live" for anything the delta did not fetch — and that set
        // is precisely where the rival copies were written.
        const inventory = await buildContentInventory(issueSyncConfig, {
            type      : 'pulls',
            filePrefix: aiConfig.issueSync.pullFilenamePrefix || 'pr-'
        });
        const planBuckets          = this.#planBuckets(metadata, allPullRequests, inventory);
        let   shouldPruneEmptyDirs = false;

        for (const pr of allPullRequests) {
            try {
                const targetPath  = this.#getPullRequestPath(pr, planBuckets, inventory);
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
            // A PR the loop above refused or failed on has no resolved path. It must drop out of the
            // cache entirely rather than be recorded with an undefined one: absent, the next run
            // re-fetches it; recorded-as-null, the entry claims a location that does not exist and we
            // have written the same class of lie this lane exists to remove. Skipping also keeps one
            // bad id from throwing out here — outside the per-PR catch — and taking the whole run's
            // metadata and index write down with it.
            if (!p.relativeOutputPath) {
                logger.warn(`⚠️ Pull request #${p.number} produced no path — omitted from metadata and index this run.`);
                return;
            }

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

            // From the written path, NOT from the plan. These can now legitimately disagree: an
            // already-archived PR keeps its occupied location while the plan proposes a freshly
            // ranked one, so an entry built from `plan.itemIndex` would carry a chunkNumber that
            // contradicts its own path — an index internally inconsistent with the file it names.
            indexEntries.push(createContentIndexEntryFromPath({
                issueSyncConfig,
                type    : 'pulls',
                id      : p.number,
                filePath: path.resolve(aiConfig.projectRoot, p.relativeOutputPath)
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
     * @summary Restores pull requests owning more than one artifact from canonical GitHub state.
     *
     * A divergent pair cannot be resolved locally. Both files are real renderings of one PR and
     * nothing on disk records which is current — `reconcileActiveChunks`' keep-first dedup is safe in
     * the active tier only because the next sync rewrites the survivor from GitHub, and applied here
     * it would silently canonicalise whichever copy sorted first. So neither copy is trusted: GitHub
     * is the source of truth for this corpus, and the artifact is re-derived from it.
     *
     * **Fetch before unlink.** The copies are the only local record of that PR, so deleting first and
     * writing second would turn any network failure into a corpus that is simply missing the PR — a
     * repair that can lose data on a bad connection is not a repair. Nothing is removed until the
     * canonical rendering is in hand.
     *
     * Placement re-plans against a corpus with the removed copies excluded, so the artifact lands on
     * the ordinal the complete ordering chooses rather than beside the wreckage of the old pair.
     *
     * @param {Object} metadata Sync metadata; refreshed for each repaired PR.
     * @param {Object} [indexMutations=null] Optional accumulator for `_index.json` updates. When
     *     omitted, the index realigns on the next {@link reconcilePullRequestIndex} pass.
     * @returns {Promise<{repaired: Number[], removed: Number, failed: Array<{id: Number, reason: String}>}>}
     */
    async repairDuplicateArtifacts(metadata, indexMutations = null) {
        const inventory = await buildContentInventory(issueSyncConfig, {
            type      : 'pulls',
            filePrefix: aiConfig.issueSync.pullFilenamePrefix || 'pr-'
        });

        const ambiguous = [...inventory.entries()].filter(([, copies]) => copies.length > 1),
              stats     = {repaired: [], removed: 0, failed: []};

        if (ambiguous.length === 0) return stats;

        logger.info(`🔧 Restoring ${ambiguous.length} pull request(s) with duplicate artifacts from GitHub...`);

        for (const [id, copies] of ambiguous) {
            try {
                const data = await GraphqlService.query(
                    FETCH_SINGLE_PULL_FOR_SYNC,
                    {
                        owner      : aiConfig.owner,
                        repo       : aiConfig.repo,
                        prNumber   : id,
                        maxComments: pullRequestConfig.maxCommentsPerPullRequest || 50,
                        maxReviews : 20
                    },
                    true
                );

                const pr = data.repository.pullRequest;

                if (!pr) {
                    // Refuse rather than clean up: a PR absent from GitHub means the duplicate is not
                    // the only thing we misunderstand here, and deleting both copies would destroy
                    // the sole remaining record of it.
                    stats.failed.push({id, reason: 'not found on GitHub — copies left untouched'});
                    continue;
                }

                const content = this.#renderPullRequestMarkdown(pr);

                // Plan against membership with THIS id's duplicates excluded — they are about to stop
                // existing, and `#getPullRequestPath` refuses an ambiguous id by design.
                //
                // On a CLONE, because the shared inventory must only ever describe DURABLE state.
                // Deleting from it here would mean a post-fetch failure — mkdir, write, rename, or a
                // crash — leaves the loop holding membership that no longer matches disk: the files
                // survive (that is what the write-failure witness proves) while the map has silently
                // lost a member, so every LATER id in this pass plans its ordinal against a corpus
                // short one PR. A failure must cost this id's repair and nothing else. The blast
                // radius of a soft-failed restore is the id it failed on.
                const planningInventory = new Map(inventory);

                planningInventory.delete(id);

                const planBuckets = this.#planBuckets(metadata, [pr], planningInventory),
                      targetPath  = this.#getPullRequestPath(pr, planBuckets, planningInventory);

                // DURABLE FIRST, then delete. Holding the canonical rendering in memory protects
                // against a failed fetch and nothing else: every step between an unlink and the
                // write can throw — planning, path resolution, mkdir, the write itself — and a crash
                // needs no exception at all. Any of them, with the copies already gone, leaves the
                // corpus missing the PR entirely and the failure logged as a soft skip. "Fetched"
                // is not "durable"; only a file on disk is.
                //
                // Temp + atomic rename so a torn write cannot masquerade as the canonical artifact.
                await writeFileAtomic(targetPath, content);

                // Only now remove the stale copies — and never the one just written, which may BE
                // one of them when the canonical location is a copy's own address.
                for (const copy of copies) {
                    if (path.resolve(copy.absPath) === path.resolve(targetPath)) continue;

                    await fs.unlink(copy.absPath);
                    stats.removed++;
                }

                // Durable now: the artifact is on disk and the rivals are gone, so the shared
                // inventory may finally be told. Replacing the id's entry outright — the copies it
                // listed no longer exist — makes the map match disk exactly at this point, which is
                // the invariant every later id in the loop plans against.
                inventory.set(id, [{
                    absPath    : targetPath,
                    ...parseContentPath({contentRoot: issueSyncConfig.contentRoot, filePath: targetPath, ...pathSegmentOptionsFor(issueSyncConfig)})
                }]);

                metadata.pulls ??= {};
                metadata.pulls[id] = {
                    number     : pr.number,
                    contentHash: this.#calculateContentHash(content),
                    state      : pr.state,
                    updatedAt  : pr.updatedAt,
                    closedAt   : pr.closedAt || null,
                    mergedAt   : pr.mergedAt || null,
                    milestone  : pr.milestone?.title || null,
                    path       : this.#relativePath(targetPath)
                };

                if (indexMutations) {
                    indexMutations.upsert.push(createContentIndexEntryFromPath({
                        issueSyncConfig, type: 'pulls', id, filePath: targetPath
                    }));
                }

                stats.repaired.push(id);
            } catch (e) {
                logger.error(`❌ Could not restore duplicate artifacts for PR #${id}: ${e.message}`);
                stats.failed.push({id, reason: e.message});
            }
        }

        await pruneEmptyDirs(path.join(issueSyncConfig.archiveRoot, 'pulls'));

        logger.info(`🔧 Restored ${stats.repaired.length} pull request(s) from GitHub; removed ${stats.removed} duplicate artifact(s).`);

        if (stats.failed.length > 0) {
            logger.warn(`⚠️ ${stats.failed.length} duplicate repair(s) failed and remain divergent: ${stats.failed.map(f => `#${f.id} (${f.reason})`).join(', ')}`);
        }

        return stats;
    }

    /**
     * @summary The terminal integrity verdict over the pull corpus.
     *
     * A thin owner-side wrapper, and deliberately a method rather than a call the orchestrator makes
     * itself. Two reasons, both structural: the orchestrator would otherwise have to know
     * pull-specific facts (the type segment, the filename prefix) that belong to this syncer, and a
     * bare module call is unstubbable — the Stage-2 sequencing specs stub every pull pass, and a
     * verdict they cannot stub reads the real `resources/content` from a unit run.
     *
     * @returns {Promise<Object>} The structured result from `validateContentIntegrity`.
     */
    async verifyCorpusIntegrity() {
        return validateContentIntegrity(issueSyncConfig, {
            type      : 'pulls',
            filePrefix: aiConfig.issueSync.pullFilenamePrefix || 'pr-'
        });
    }

    /**
     * @summary Realigns `_index.json` with the pull corpus on disk. The repair half of this lane.
     *
     * The index is a PROJECTION of the corpus, so it can always be recomputed from it — and once a
     * pass exists that does, drift is not a state anyone has to migrate out of. Every id owning
     * exactly one artifact gets an entry naming that artifact's actual location.
     *
     * This exists because preventing new drift does not remove old drift, and nothing else would ever
     * have: the thousands of entries already naming pre-move locations point at files that are
     * ALREADY archived, so the relocate pass never touches them again and never re-indexes them.
     * They are unreachable by every mechanism that was expected to heal them. A migration script
     * would clear them once and leave the class alive; the drift was produced by the normal path, so
     * the normal path is what has to be able to remove it. Run every sync, idempotent, cheap when
     * clean — it upserts only entries that actually disagree with disk, so a healthy corpus writes
     * nothing and the generated-content diff stays empty.
     *
     * A projection REMOVES as well as writes. Skipping an ambiguous id is not enough when a row for
     * it already exists: that row names one of two divergent artifacts and thereby blesses it as
     * canonical — the arbitrary choice this lane refuses — and it does so silently, because the path
     * it names is real and resolves. The same holds for an id whose artifact is gone entirely: the
     * row survives as a lookup into nothing. "Exactly one artifact, or no row" is the contract; an
     * index that only ever grows is a cache, not a projection.
     *
     * @param {Map<number, Array<object>>} [inventory] Pre-built corpus inventory; scanned when omitted.
     * @returns {Promise<{reindexed: Number, unchanged: Number, removed: Number, skippedAmbiguous: Number[]}>}
     */
    async reconcilePullRequestIndex(inventory = null) {
        const corpus = inventory || await buildContentInventory(issueSyncConfig, {
            type      : 'pulls',
            filePrefix: aiConfig.issueSync.pullFilenamePrefix || 'pr-'
        });

        const existing = new Map(
            (await readContentIndex(issueSyncConfig))
                .filter(entry => entry.type === 'pulls')
                .map(entry => [Number(entry.id), entry])
        );

        const upsert           = [],
              remove           = [],
              skippedAmbiguous = [];

        let unchanged = 0;

        for (const [id, copies] of corpus) {
            if (copies.length > 1) {
                skippedAmbiguous.push(id);

                // Not merely un-indexed: any EXISTING row for this id must go. It names one of two
                // divergent artifacts, and a row is an assertion that the id resolves there — which
                // is the canonical-by-implication choice this lane refuses to make on the corpus's
                // behalf. Silently, too: the path is real, so every existence check passes.
                if (existing.has(id)) remove.push({type: 'pulls', id});

                continue;
            }

            const entry = createContentIndexEntryFromPath({
                issueSyncConfig,
                type    : 'pulls',
                id,
                filePath: copies[0].absPath
            });

            const previous = existing.get(id);

            // Compare every coordinate, not just the path: an entry can name the right file and still
            // carry a chunkNumber that contradicts it.
            if (previous &&
                previous.path        === entry.path &&
                previous.chunkNumber === entry.chunkNumber &&
                (previous.version ?? null) === (entry.version ?? null)
            ) {
                unchanged++;
                continue;
            }

            upsert.push(entry);
        }

        // A row whose id owns NO artifact at all is a lookup into nothing. The projection drops it
        // rather than leaving a resolvable-looking entry behind.
        for (const id of existing.keys()) {
            if (!corpus.has(id)) remove.push({type: 'pulls', id});
        }

        if (upsert.length > 0 || remove.length > 0) {
            await updateContentIndex(issueSyncConfig, {upsert, remove});
            logger.info(`🧭 Realigned the pull index with the corpus: ${upsert.length} written, ${remove.length} removed, ${unchanged} already correct.`);
        }

        if (skippedAmbiguous.length > 0) {
            logger.warn(`⚠️ ${skippedAmbiguous.length} pull request(s) own more than one artifact and are unindexed pending repair: ${skippedAmbiguous.join(', ')}`);
        }

        return {reindexed: upsert.length, unchanged, removed: remove.length, skippedAmbiguous};
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
     * Placement is resolved against the complete corpus, not against the refetch list. This path is
     * the narrowest view in the syncer — one PR — so ranking a bucket from it produced the most
     * confidently wrong ordinal available, and the write landed beside the artifact it was sent to
     * repair. A recovery primitive that manufactures the drift it exists to remove is worse than no
     * recovery primitive, because it is invoked precisely when the corpus is already suspect.
     *
     * @param {Array<Number>|Set<Number>} numbers The pull-request numbers to refetch.
     * @param {Object} metadata The sync metadata object (mutated in place).
     * @param {Object} [indexMutations=null] Optional accumulator for `_index.json` updates.
     * @returns {Promise<{refetched: {count: Number, pulls: Number[]}, errors: Array<{prNumber: Number, error: String}>}>}
     */
    async refetchPullsByNumber(numbers, metadata, indexMutations = null) {
        const stats = {refetched: {count: 0, pulls: []}, errors: []};
        const list  = [...numbers];

        const inventory = await buildContentInventory(issueSyncConfig, {
            type      : 'pulls',
            filePrefix: aiConfig.issueSync.pullFilenamePrefix || 'pr-'
        });

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

                const planBuckets = this.#planBuckets(metadata, [pr], inventory);
                const targetPath  = this.#getPullRequestPath(pr, planBuckets, inventory);
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
                    // Derived from the written path: with placement now preserving an occupied
                    // archive location, a plan-derived chunkNumber can contradict the very path it
                    // ships beside.
                    indexMutations.upsert.push(createContentIndexEntryFromPath({
                        issueSyncConfig,
                        type    : 'pulls',
                        id      : prNumber,
                        filePath: this.#resolvePath(this.#relativePath(targetPath))
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
