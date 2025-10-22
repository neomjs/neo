import aiConfig       from '../config.mjs';
import Base           from '../../../../../src/core/Base.mjs';
import fs             from 'fs/promises';
import glob           from 'glob';
import logger         from '../../logger.mjs';
import path           from 'path';
import { promisify }  from 'util';

const globAsync = promisify(glob);

/**
 * Service for local file system lookups related to the GitHub workflow.
 * @class Neo.ai.mcp.server.github-workflow.LocalFileService
 * @extends Neo.core.Base
 * @singleton
 */
class LocalFileService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.LocalFileService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.LocalFileService',
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
        const filename = `${aiConfig.issueSync.issueFilenamePrefix}${normalizedId}.md`;

        try {
            // 1. Check the active issues directory first
            const activePath = path.join(aiConfig.issueSync.issuesDir, filename);
            if (await this.#fileExists(activePath)) {
                const content = await fs.readFile(activePath, 'utf-8');
                return { filePath: activePath, content };
            }

            // 2. If not found, search the archive directory recursively
            const archivePattern = path.join(aiConfig.issueSync.archiveDir, '**', filename);
            const archiveFiles = await globAsync(archivePattern);

            if (archiveFiles.length > 0) {
                const archivePath = archiveFiles[0]; // Use the first match
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
     * Checks if a file exists at the given path.
     * @param {string} filePath - The path to check.
     * @returns {Promise<boolean>} True if the file exists, false otherwise.
     * @private
     */
    async #fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

export default Neo.setupClass(LocalFileService);
