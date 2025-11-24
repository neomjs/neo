import aiConfig from '../../config.mjs';
import Base     from '../../../../../../src/core/Base.mjs';
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
 * @class Neo.ai.mcp.server.github-workflow.services.sync.MetadataManager
 * @extends Neo.core.Base
 * @singleton
 */
class MetadataManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.sync.MetadataManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.sync.MetadataManager',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
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
                    releases: {}
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
            releases           : {}
        };

        // Prune issues
        for (const [key, value] of Object.entries(metadata.issues)) {
            prunedMetadata.issues[key] = {
                state      : value.state,
                path       : value.path,
                closedAt   : value.closedAt,
                updatedAt  : value.updatedAt,
                contentHash: value.contentHash
            };
        }

        // Prune releases
        for (const [key, value] of Object.entries(metadata.releases)) {
            prunedMetadata.releases[key] = {
                publishedAt: value.publishedAt,
                contentHash: value.contentHash
            };
        }

        const dir = path.dirname(issueSyncConfig.metadataFile);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(issueSyncConfig.metadataFile, JSON.stringify(prunedMetadata, null, 2), 'utf-8');
    }
}

export default Neo.setupClass(MetadataManager);
