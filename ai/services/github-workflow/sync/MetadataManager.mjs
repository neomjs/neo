import aiConfig from '../../../mcp/server/github-workflow/config.mjs';
import Base     from '../../../../src/core/Base.mjs';
import fs       from 'fs/promises';
import path     from 'path';

const issueSyncConfig = aiConfig.issueSync;

/**
 * @summary Manages loading, saving, and pruning of the .sync-metadata.json file.
 *
 * This service handles the persistence of the synchronization state.
 * It ensures that the metadata file is properly loaded on startup and saved after sync operations.
 * Crucially, it "prunes" the metadata before saving to ensure only essential change-detection
 * fields (like `contentHash` and `updatedAt`) are stored, keeping the file size manageable.
 *
 * @class Neo.ai.services.github-workflow.sync.MetadataManager
 * @extends Neo.core.Base
 * @singleton
 */
class MetadataManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.sync.MetadataManager'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.sync.MetadataManager',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Returns a clone of metadata without root-level telemetry timestamps.
     * @param {object} metadata The pruned metadata object.
     * @returns {object} The comparable metadata payload.
     * @private
     */
    #withoutRootTelemetryTimestamps(metadata) {
        const clone = structuredClone(metadata);

        delete clone.lastSync;
        delete clone.releasesLastFetched;

        return clone;
    }

    /**
     * @summary Detects when saving would only update root-level telemetry timestamps.
     * @param {object} existingMetadata The currently persisted metadata.
     * @param {object} nextMetadata The next pruned metadata payload.
     * @returns {boolean}
     * @private
     */
    #onlyRootTelemetryTimestampsChanged(existingMetadata, nextMetadata) {
        return JSON.stringify(this.#withoutRootTelemetryTimestamps(existingMetadata)) ===
            JSON.stringify(this.#withoutRootTelemetryTimestamps(nextMetadata)) &&
            JSON.stringify(existingMetadata) !== JSON.stringify(nextMetadata);
    }

    /**
     * Loads the synchronization metadata file from disk.
     * If the file doesn't exist, it returns a default empty metadata object.
     * @returns {Promise<object>} The parsed metadata object.
     * @throws {Error} If reading the file fails for reasons other than not existing.
     */
    async load() {
        try {
            const data = await fs.readFile(issueSyncConfig.metadataFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    lastSync: null,
                    issues  : {},
                    releases: {},
                    pulls   : {},
                    discussions: {}
                };
            } else {
                throw error;
            }
        }
    }

    /**
     * Saves the provided metadata object to the configured metadata file on disk,
     * ensuring the directory exists. This method also prunes the data to save only
     * essential fields for change detection.
     * @param {object} metadata The metadata object to serialize and save.
     * @returns {Promise<void>}
     */
    async save(metadata) {
        const prunedMetadata = {
            lastSync           : metadata.lastSync,
            releasesLastFetched: metadata.releasesLastFetched,
            pushFailures       : metadata.pushFailures || [],
            issues             : {},
            releases           : {},
            pulls              : {},
            discussions        : {}
        };

        // Prune issues
        for (const [key, value] of Object.entries(metadata.issues)) {
            prunedMetadata.issues[key] = {
                state        : value.state,
                path         : value.path,
                closedAt     : value.closedAt,
                updatedAt    : value.updatedAt,
                contentHash  : value.contentHash,
                // Persist milestone as a string-title, symmetric with IssueSyncer hydration into
                // `{title}` form. Without this, planBuckets falls through to closedAt-based release-date
                // inference and re-classifies unchanged closed issues every sync, emitting persistent
                // ARCHIVE ANOMALY WARN noise.
                //
                // Shape handling: `IssueSyncer.pullFromGitHub` seeds `newMetadata.issues` from existing
                // serialized metadata (already string form), THEN overwrites fetched issues with the
                // object form (`{title: '...'}`). The prune must preserve BOTH paths: string entries
                // (unchanged cached issues) pass through verbatim; object entries (freshly fetched)
                // get `.title` extracted. A naive `value.milestone?.title || null` would prune cached
                // strings back to `null` on every save.
                milestone    : typeof value.milestone === 'string'
                    ? value.milestone
                    : (value.milestone?.title || null),
                // commentsTotal is the count of ISSUE_COMMENT nodes derived from the exhausted
                // timelineItems connection. The metadata value is structurally guaranteed to match
                // the rendered markdown because both are produced from the same timeline.
                commentsTotal: value.commentsTotal
            };
        }

        // Prune releases
        for (const [key, value] of Object.entries(metadata.releases || {})) {
            prunedMetadata.releases[key] = {
                publishedAt: value.publishedAt,
                contentHash: value.contentHash
            };
        }

        // Prune pulls — `archiveVersion` is intentionally NOT persisted. Archive-bucket placement is
        // derived fresh each sync from real milestone/release-date logic in PullRequestSyncer#planBuckets;
        // a carried-forward archiveVersion could re-lock a stale bucket into .sync-metadata.json.
        for (const [key, value] of Object.entries(metadata.pulls || {})) {
            prunedMetadata.pulls[key] = {
                state      : value.state,
                path       : value.path,
                closedAt   : value.closedAt,
                mergedAt   : value.mergedAt,
                milestone  : value.milestone,
                updatedAt  : value.updatedAt,
                contentHash: value.contentHash
            };
        }

        // Prune discussions.
        //
        // `updatedAt` is persisted because the discussion delta cutoff is computed from it. Omitting
        // it here meant the field could not survive a save/load round trip, so every run read an
        // empty date list, fell back to a zero cutoff and re-paged the whole discussion history —
        // symmetric with the issue prune above, which has always carried it.
        for (const [key, value] of Object.entries(metadata.discussions || {})) {
            prunedMetadata.discussions[key] = {
                number     : value.number,
                path       : value.path,
                closed     : value.closed,
                closedAt   : value.closedAt,
                contentHash: value.contentHash,
                updatedAt  : value.updatedAt
            };
        }

        const dir = path.dirname(issueSyncConfig.metadataFile);
        await fs.mkdir(dir, { recursive: true });

        try {
            const existingData     = await fs.readFile(issueSyncConfig.metadataFile, 'utf-8');
            const existingMetadata = JSON.parse(existingData);

            if (this.#onlyRootTelemetryTimestampsChanged(existingMetadata, prunedMetadata)) {
                return;
            }
        } catch (error) {
            if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
                throw error;
            }
        }

        await fs.writeFile(issueSyncConfig.metadataFile, JSON.stringify(prunedMetadata, null, 2), 'utf-8');
    }
}

export default Neo.setupClass(MetadataManager);
