import aiConfig from '../../mcp/server/github-workflow/config.mjs';
import Base     from '../../../src/core/Base.mjs';
import fs       from 'fs-extra';
import logger   from '../../mcp/server/github-workflow/logger.mjs';
import {
    findContentIndexEntry,
    readContentIndex,
    resolveIndexedPath
} from './shared/contentIndex.mjs';

/**
 * @summary Service for local file system lookups related to the GitHub workflow.
 *
 * This service provides efficient mechanisms to locate and read local content files by ID.
 * ID lookup is backed by `resources/content/_index.json` instead of deriving a path from the
 * GitHub number.
 *
 * @class Neo.ai.services.github-workflow.LocalFileService
 * @extends Neo.core.Base
 * @singleton
 */
class LocalFileService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.LocalFileService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.LocalFileService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Reads a content file through the `_index.json` lookup surface.
     *
     * Missing entries return `NOT_FOUND` with a regeneration hint; entries whose files no longer
     * exist return `STALE_INDEX` so callers can distinguish bad index data from absent content.
     *
     * @param {'issues'|'discussions'} type Content type stored in the index
     * @param {String|Number} rawId GitHub number, with or without a leading `#`
     * @param {String} label Human-readable type label for logs and errors
     * @returns {Promise<object>} File payload or structured error
     * @private
     */
    async #getByIndexedContentId(type, rawId, label) {
        const idValue      = String(rawId);
        const normalizedId = idValue.startsWith('#') ? idValue.substring(1) : idValue;

        try {
            const index = await readContentIndex(aiConfig.issueSync);
            const entry = findContentIndexEntry(index, {type, id: normalizedId});

            if (!entry) {
                logger.warn(`[LocalFileService] ${label} index entry not found for #${normalizedId}`);
                return {
                    error  : 'File not found',
                    message: `No local markdown index entry found for ${label.toLowerCase()} #${normalizedId}. Use live GitHub for current state; the scheduled Data Sync pipeline regenerates resources/content/_index.json.`,
                    code   : 'NOT_FOUND'
                };
            }

            const filePath = resolveIndexedPath(aiConfig.issueSync, entry);

            if (!await fs.pathExists(filePath)) {
                logger.warn(`[LocalFileService] ${label} indexed path is stale for #${normalizedId}: ${filePath}`);
                return {
                    error  : 'Stale content index',
                    message: `Indexed markdown file for ${label.toLowerCase()} #${normalizedId} does not exist. Use live GitHub for current state; the scheduled Data Sync pipeline regenerates resources/content/_index.json.`,
                    code   : 'STALE_INDEX'
                };
            }

            const content = await fs.readFile(filePath, 'utf-8');
            return {filePath, content};
        } catch (error) {
            logger.error(`[LocalFileService] Error getting ${label.toLowerCase()} #${normalizedId}:`, error);
            return {
                error  : 'Internal server error',
                message: error.message,
                code   : 'SERVER_ERROR'
            };
        }
    }

    /**
     * Finds and returns the content of a local issue file by its number.
     *
     * The content index replaces ID-derived folder lookup because ordinal-100 chunk position is
     * no longer derivable from the GitHub issue number.
     *
     * @param {string} issueNumber The issue number, with or without a leading '#'.
     * @returns {Promise<object>} A promise that resolves to the file content or a structured error.
     */
    async getIssueById(issueNumber) {
        return this.#getByIndexedContentId('issues', issueNumber, 'Issue');
    }

    /**
     * Finds and returns the content of a local discussion file by its number.
     *
     * The primary read path avoids flat-path and recursive lookup assumptions. The syncers own
     * `_index.json` maintenance; this service consumes that index directly.
     *
     * @param {string} discussionNumber The discussion number, with or without a leading '#'.
     * @returns {Promise<object>} A promise that resolves to the file content or a structured error.
     */
    async getDiscussionById(discussionNumber) {
        return this.#getByIndexedContentId('discussions', discussionNumber, 'Discussion');
    }
}

export default Neo.setupClass(LocalFileService);
