import aiConfig from '../config.mjs';
import Base     from '../../../../../src/core/Base.mjs';
import fs       from 'fs-extra';
import logger   from '../logger.mjs';
import path     from 'path';

/**
 * Service for local file system lookups related to the GitHub workflow.
 * @class Neo.ai.mcp.server.github-workflow.services.LocalFileService
 * @extends Neo.core.Base
 * @singleton
 */
class LocalFileService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.LocalFileService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.LocalFileService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Finds and returns the content of a local issue file by its number.
     * @param {string} issueNumber - The issue number, with or without a leading '#'.
     * @returns {Promise<object>} A promise that resolves to the file content or a structured error.
     */
    async getIssueById(issueNumber) {
        const normalizedId = issueNumber.startsWith('#') ? issueNumber.substring(1) : issueNumber;
        const filename     = `${aiConfig.issueSync.issueFilenamePrefix}${normalizedId}.md`;

        try {
            // 1. Check the active issues directory first
            const activePath = path.join(aiConfig.issueSync.issuesDir, filename);
            if (await fs.pathExists(activePath)) {
                const content = await fs.readFile(activePath, 'utf-8');
                return { filePath: activePath, content };
            }

            // 2. If not found, search the archive directory recursively
            const archivePath = await this.#findFileRecursively(aiConfig.issueSync.archiveDir, filename);

            if (archivePath) {
                const content = await fs.readFile(archivePath, 'utf-8');
                return { filePath: archivePath, content };
            }

            // 3. If not found anywhere, return an error
            logger.warn(`[LocalFileService] Issue file not found for #${normalizedId}`);
            return {
                error  : 'File not found',
                message: `No local markdown file found for issue #${normalizedId}.`,
                code   : 'NOT_FOUND'
            };

        } catch (error) {
            logger.error(`[LocalFileService] Error getting issue #${normalizedId}:`, error);
            return {
                error  : 'Internal server error',
                message: error.message,
                code   : 'SERVER_ERROR'
            };
        }
    }

    /**
     * Recursively searches for a file within a directory and its subdirectories.
     * @param {string} directory - The directory to start the search from.
     * @param {string} filename - The name of the file to find.
     * @returns {Promise<string|null>} The absolute path of the file if found, otherwise null.
     * @private
     */
    async #findFileRecursively(directory, filename) {
        try {
            const entries = await fs.readdir(directory, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);

                if (entry.isDirectory()) {
                    const foundPath = await this.#findFileRecursively(fullPath, filename);
                    if (foundPath) {
                        return foundPath;
                    }
                } else if (entry.isFile() && entry.name === filename) {
                    return fullPath;
                }
            }
        } catch (e) {
            // Directory might not exist, or other fs errors. Ignore and continue search.
            logger.debug(`[LocalFileService] Error accessing directory ${directory}: ${e.message}`);
        }
        return null;
    }
}

export default Neo.setupClass(LocalFileService);
