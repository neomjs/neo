import {createHash, randomUUID} from 'node:crypto';
import path                     from 'node:path';
import fs                       from 'fs-extra';
import GitMirror                from '../../../services/knowledge-base/helpers/gitMirror.mjs';
import IssueIngestor            from '../../../services/ingestion/IssueIngestor.mjs';
import logger                   from '../../../mcp/server/memory-core/logger.mjs';
import {
    beginCorpusProjection,
    commitCorpusProjectionFacet,
    CORPUS_PROJECTION_FACETS,
    CORPUS_PROJECTION_OWNER,
    createCorpusProjectionReceipt,
    failCorpusProjectionFacet,
    recordCorpusMaterialization
} from '../../../services/graph/corpusProjectionContract.mjs';
import {
    readCorpusProjectionReceipt,
    writeCorpusProjectionReceipt
} from '../../../services/graph/corpusProjectionReceiptStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/coreCorpusProjection
 * @summary One statically followable container-plane projection cycle: fetch an explicit Git source,
 * materialize its exact core-corpus revision, run strict per-facet ingestion, and advance durable
 * source-bound receipts only for facets that complete.
 */

const CORPUS_PATH_PATTERN = /^resources\/content\/(?:_index\.json|(?:issues|pulls|discussions)(?:\/|$)|archive\/(?:issues|pulls|discussions)(?:\/|$))/;

/**
 * @summary Creates one stable-code projection failure while retaining machine-readable details.
 * @param {String} code Stable error code.
 * @param {String} message Human-readable failure summary.
 * @param {Object} [details={}] Additional receipt/materialization evidence.
 * @returns {Error}
 */
function createProjectionError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error
}

/**
 * @summary Derives collision-resistant GitMirror coordinates from the explicit source repository.
 * @param {String} sourceRepository Canonical clone URL or local Git source.
 * @returns {{tenantId: String, repoSlug: String}}
 */
function getMirrorIdentity(sourceRepository) {
    return {
        tenantId: 'core-corpus',
        repoSlug: `source-${createHash('sha256').update(sourceRepository).digest('hex').slice(0, 16)}`
    }
}

/**
 * @summary Tests whether materialization and every facet cursor cover the advertised source head.
 * @param {Object|null} receipt Projection receipt.
 * @returns {Boolean}
 */
function isProjectionCurrent(receipt) {
    const head = receipt?.availableCorpusRevision;

    return Boolean(head) &&
        receipt.materializedCorpusRevision === head &&
        CORPUS_PROJECTION_FACETS.every(facet =>
            receipt.projectedRevisionByFacet[facet] === head &&
            receipt.projectionStateByFacet[facet].status === 'committed'
        )
}

/**
 * @summary Decides whether the named periodic full-rematerialization interval has elapsed.
 * @param {Object|null} receipt Projection receipt.
 * @param {Number} nowMs Current epoch milliseconds.
 * @param {Number} intervalMs Full-rematerialization cadence.
 * @returns {Boolean}
 */
function needsPeriodicFullMaterialization(receipt, nowMs, intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return false;

    const last = Date.parse(receipt?.lastFullMaterializationAt || '');

    return !Number.isFinite(last) || nowMs - last >= intervalMs
}

/**
 * @summary Applies an async mapper through a bounded worker pool without reordering custody.
 * @param {Array<*>} values Input values.
 * @param {Number} limit Maximum concurrent reads.
 * @param {Function} fn Async mapper.
 * @returns {Promise<void>}
 */
async function mapWithConcurrency(values, limit, fn) {
    const queue   = [...values];
    const workers = Array.from({length: Math.min(limit, queue.length)}, async () => {
        while (queue.length) {
            const value = queue.shift();
            await fn(value)
        }
    });

    await Promise.all(workers)
}

/**
 * @summary Returns true for the three projection facets and their active/archive index inputs.
 * @param {String} sourcePath Repo-relative source path.
 * @returns {Boolean}
 */
export function isCoreCorpusProjectionPath(sourcePath) {
    return typeof sourcePath === 'string' && CORPUS_PATH_PATTERN.test(sourcePath.replace(/\\/g, '/'))
}

/**
 * @summary Maps exact-revision path changes to the facets whose materialized inputs changed.
 * The shared root index can remap any facet id, so it truthfully invalidates all three.
 * @param {String[]} sourcePaths Repo-relative added, changed, or deleted paths.
 * @returns {String[]} Facets in canonical receipt order.
 */
export function getChangedCorpusProjectionFacets(sourcePaths = []) {
    const changed = new Set();

    for (const sourcePath of sourcePaths) {
        const normalized = typeof sourcePath === 'string' ? sourcePath.replace(/\\/g, '/') : '';

        const match = normalized.match(/^resources\/content\/(?:archive\/)?(issues|pulls|discussions)(?:\/|$)/);
        if (match) changed.add(match[1])
    }

    return CORPUS_PROJECTION_FACETS.filter(facet => changed.has(facet))
}

/**
 * @summary Compares the shared root content index by facet, preventing its routine rewrite from
 * invalidating unrelated consumers. Every relevant row is compared, not merely row counts, so a
 * same-count id/path substitution still marks the owning facet changed.
 * @param {String|Buffer} baseContent Exact base-revision index JSON.
 * @param {String|Buffer} headContent Exact head-revision index JSON.
 * @returns {String[]} Changed facets in canonical receipt order.
 */
export function getChangedCorpusIndexFacets(baseContent, headContent) {
    const base = JSON.parse(String(baseContent));
    const head = JSON.parse(String(headContent));

    if (!Array.isArray(base) || !Array.isArray(head)) {
        throw createProjectionError(
            'CORE_CORPUS_INDEX_INVALID',
            'Core corpus root index must be a JSON array at both revisions'
        )
    }

    const signature = (rows, facet) => JSON.stringify(rows
        .filter(row => row?.type === facet)
        .sort((a, b) => `${a.path || ''}:${a.id ?? ''}`.localeCompare(`${b.path || ''}:${b.id ?? ''}`)));

    return CORPUS_PROJECTION_FACETS.filter(facet => signature(base, facet) !== signature(head, facet))
}

/**
 * @summary Materializes one exact source revision, either by full sibling-directory replacement or
 * an exact base→head diff over the already committed view.
 * @param {Object} options
 * @returns {Promise<{full: Boolean, addedOrChanged: String[], deleted: String[], changedFacets: String[]}>}
 */
export async function materializeCoreCorpusRevision({
    full,
    baseRevision,
    headRevision,
    identity,
    mirrorRoot,
    materializedRoot,
    readConcurrency,
    gitMirror = GitMirror,
    fileSystem = fs
} = {}) {
    if (!Number.isInteger(readConcurrency) || readConcurrency < 1 || readConcurrency > 32) {
        throw createProjectionError(
            'CORE_CORPUS_READ_CONCURRENCY_INVALID',
            `Core corpus readConcurrency must be an integer in [1,32], got ${readConcurrency}`
        )
    }

    let addedOrChanged, deleted, indexChangedFacets = [];

    if (full) {
        addedOrChanged = (await gitMirror.listRevisionPaths({
            mirrorRoot,
            ...identity,
            revision: headRevision
        })).filter(isCoreCorpusProjectionPath);
        deleted = []
    } else {
        const diff = await gitMirror.diffRevisions({
            mirrorRoot,
            ...identity,
            baseRevision,
            headRevision
        });
        addedOrChanged = diff.addedOrChanged.filter(isCoreCorpusProjectionPath);
        deleted = diff.deleted.filter(isCoreCorpusProjectionPath);

        const rootIndexPath = 'resources/content/_index.json';

        if (deleted.includes(rootIndexPath)) {
            indexChangedFacets = [...CORPUS_PROJECTION_FACETS]
        } else if (addedOrChanged.includes(rootIndexPath)) {
            const headIndex = await gitMirror.readRevisionFile({
                mirrorRoot,
                ...identity,
                revision  : headRevision,
                sourcePath: rootIndexPath
            });

            try {
                const baseIndex = await gitMirror.readRevisionFile({
                    mirrorRoot,
                    ...identity,
                    revision  : baseRevision,
                    sourcePath: rootIndexPath
                });
                indexChangedFacets = getChangedCorpusIndexFacets(baseIndex, headIndex)
            } catch (error) {
                // A newly introduced/unreadable base index cannot prove any facet unchanged.
                // Re-running all facets is the fail-closed recovery; strict head ingestion still
                // rejects malformed current JSON before a cursor can advance.
                indexChangedFacets = [...CORPUS_PROJECTION_FACETS]
            }
        }
    }

    const targetRoot = full ? `${materializedRoot}.next-${process.pid}-${randomUUID()}` : materializedRoot;

    if (full) {
        await fileSystem.remove(targetRoot);
        await fileSystem.ensureDir(targetRoot)
    } else {
        await fileSystem.ensureDir(targetRoot)
    }

    try {
        await mapWithConcurrency(addedOrChanged, readConcurrency, async sourcePath => {
            const content = await gitMirror.readRevisionFile({
                mirrorRoot,
                ...identity,
                revision: headRevision,
                sourcePath
            });
            const relative = sourcePath.replace(/^resources\/content\//, '');
            await fileSystem.outputFile(path.join(targetRoot, relative), content, 'utf8')
        });

        for (const sourcePath of deleted) {
            const relative = sourcePath.replace(/^resources\/content\//, '');
            await fileSystem.remove(path.join(targetRoot, relative))
        }

        if (full) {
            const previous = `${materializedRoot}.previous-${process.pid}-${randomUUID()}`;

            if (await fileSystem.pathExists(materializedRoot)) {
                await fileSystem.move(materializedRoot, previous)
            }

            try {
                await fileSystem.move(targetRoot, materializedRoot)
            } catch (error) {
                if (await fileSystem.pathExists(previous)) {
                    await fileSystem.move(previous, materializedRoot)
                }
                throw error
            } finally {
                await fileSystem.remove(previous)
            }
        }
    } finally {
        if (full) await fileSystem.remove(targetRoot)
    }

    return {
        full,
        addedOrChanged,
        deleted,
        changedFacets: full
            ? [...CORPUS_PROJECTION_FACETS]
            : CORPUS_PROJECTION_FACETS.filter(facet =>
                indexChangedFacets.includes(facet) ||
                getChangedCorpusProjectionFacets([...addedOrChanged, ...deleted]).includes(facet)
            )
    }
}

/**
 * @summary Fetches the explicit corpus source, materializes one exact revision, then advances
 * each facet receipt only after its strict ingestor completes without a swallowed error.
 * Exported as the one-shot entrypoint's statically followable closure root; the service singleton
 * delegates here so the script-plane proof never has to guess through a class-method dispatch.
 * @param {Object} [options] Entrypoint-owned resolved config plus test/instrument seams.
 * @returns {Promise<Object>}
 */
export async function runCoreCorpusProjectionCycle({
        config,
        now = Date.now(),
        gitMirror = GitMirror,
        issueIngestor = IssueIngestor,
        fileSystem = fs,
        readReceipt = readCorpusProjectionReceipt,
        writeReceipt = writeCorpusProjectionReceipt
    } = {}) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw createProjectionError(
                'CORE_CORPUS_CONFIG_MISSING',
                'Core corpus projection requires entrypoint-injected resolved config'
            )
        }
        if (!config.enabled) return {status: 'disabled'};
        if (typeof config.sourceRepository !== 'string' || !config.sourceRepository.trim() ||
            typeof config.sourceRef !== 'string' || !config.sourceRef.trim()) {
            throw createProjectionError(
                'CORE_CORPUS_SOURCE_IDENTITY_MISSING',
                'Core corpus projection requires explicit sourceRepository and sourceRef'
            )
        }
        if (!Number.isFinite(config.freshnessSlaMs) || config.freshnessSlaMs <= 0) {
            throw createProjectionError(
                'CORE_CORPUS_FRESHNESS_SLA_INVALID',
                'Core corpus projection requires a positive freshnessSlaMs'
            )
        }

        const sourceRepository = config.sourceRepository.trim(),
              sourceRef        = config.sourceRef.trim(),
              identity         = getMirrorIdentity(sourceRepository),
              nowMs            = now instanceof Date ? now.getTime() : Number(now),
              observedAt       = new Date(nowMs).toISOString();

        let receipt = await readReceipt(config.receiptPath);

        if (!receipt || receipt.sourceRepository !== sourceRepository || receipt.sourceRef !== sourceRef) {
            receipt = createCorpusProjectionReceipt({
                sourceRepository,
                sourceRef,
                freshnessSlaMs: config.freshnessSlaMs,
                now           : observedAt
            })
        } else if (receipt.freshnessSlaMs !== config.freshnessSlaMs) {
            receipt = {...receipt, freshnessSlaMs: config.freshnessSlaMs, updatedAt: observedAt}
        }

        const clone = await gitMirror.cloneIfMissing({
            mirrorRoot: config.mirrorRoot,
            ...identity,
            cloneUrl: sourceRepository
        });

        if (!clone.cloned) {
            await gitMirror.fetch({mirrorRoot: config.mirrorRoot, ...identity})
        }

        const headRevision = await gitMirror.resolveHead({
            mirrorRoot: config.mirrorRoot,
            ...identity,
            ref: sourceRef
        });

        let full = !receipt.materializedCorpusRevision ||
            !await fileSystem.pathExists(config.materializedRoot) ||
            !isProjectionCurrent(receipt) ||
            needsPeriodicFullMaterialization(receipt, nowMs, config.fullRematerializeIntervalMs);

        if (!full && receipt.materializedCorpusRevision !== headRevision) {
            full = !await gitMirror.isAncestor({
                mirrorRoot: config.mirrorRoot,
                ...identity,
                ancestor  : receipt.materializedCorpusRevision,
                descendant: headRevision
            })
        }

        if (headRevision === receipt.availableCorpusRevision && isProjectionCurrent(receipt) && !full) {
            receipt = {...receipt, lastCheckedAt: observedAt, updatedAt: observedAt};
            await writeReceipt(config.receiptPath, receipt);

            return {status: 'up-to-date', headRevision, receipt}
        }

        const materialization = await materializeCoreCorpusRevision({
            full,
            baseRevision    : receipt.materializedCorpusRevision,
            headRevision,
            identity,
            mirrorRoot      : config.mirrorRoot,
            materializedRoot: config.materializedRoot,
            readConcurrency : config.readConcurrency,
            gitMirror,
            fileSystem
        });

        const
            changedFacets   = materialization.changedFacets,
            unchangedFacets = CORPUS_PROJECTION_FACETS.filter(facet => !changedFacets.includes(facet)),
            facetOutcomes   = [],
            failures        = [];

        // The materialized view is private staging. Publish the live-store fence only after that
        // exact revision exists, but before the first structural/vector mutation. Diff-proven
        // unchanged facets carry forward atomically so an unrelated pull-only projection cannot
        // starve Golden Path's issues+discussions route.
        receipt = beginCorpusProjection({
            receipt,
            availableRevision: headRevision,
            facets           : changedFacets,
            now              : observedAt
        });
        receipt = recordCorpusMaterialization({
            receipt,
            revision: headRevision,
            full,
            now     : observedAt
        });

        for (const facet of unchangedFacets) {
            receipt = commitCorpusProjectionFacet({receipt, facet, now: observedAt});
            facetOutcomes.push({facet, status: 'unchanged'})
        }
        await writeReceipt(config.receiptPath, receipt);

        for (const facet of changedFacets) {
            try {
                const options = {
                    contentRoot      : config.materializedRoot,
                    projectionContext: {
                        owner         : CORPUS_PROJECTION_OWNER,
                        sourceRepository,
                        sourceRef,
                        sourceRevision: headRevision
                    },
                    reconcile: true,
                    strict   : true
                };

                if (facet === 'issues') {
                    await issueIngestor.ingestIssueStates(options)
                } else if (facet === 'pulls') {
                    await issueIngestor.ingestPullRequestFeedback(options)
                } else {
                    await issueIngestor.ingestDiscussionStates(options)
                }
                receipt = commitCorpusProjectionFacet({receipt, facet, now: observedAt});
                facetOutcomes.push({facet, status: 'committed'})
            } catch (error) {
                const errorCode = error?.code || 'CORE_CORPUS_FACET_FAILED';
                receipt = failCorpusProjectionFacet({receipt, facet, errorCode, now: observedAt});
                facetOutcomes.push({facet, status: 'failed', errorCode});
                failures.push({facet, errorCode, message: error.message});
                logger.warn(`[CoreCorpusProjectionService] ${facet} projection failed: ${error.message}`)
            }

            await writeReceipt(config.receiptPath, receipt)
        }

        if (failures.length) {
            throw createProjectionError(
                'CORE_CORPUS_PROJECTION_INCOMPLETE',
                `${failures.length} corpus projection facet(s) failed`,
                {failures, receipt, materialization}
            )
        }

        return {
            status: 'completed',
            headRevision,
            materialization,
            facetOutcomes,
            receipt
        }
}
