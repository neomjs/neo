import aiConfig  from '../../mcp/server/github-workflow/config.mjs';
import Base      from '../../../src/core/Base.mjs';
import chunkPath from './shared/chunkPath.mjs';
import fs        from 'fs-extra';
import logger    from '../../mcp/server/github-workflow/logger.mjs';
import path      from 'path';

/**
 * @summary Service for local file system lookups related to the GitHub workflow.
 *
 * This service provides efficient mechanisms to locate and read local issue files.
 * It implements a recursive search strategy to handle nested issue directories
 * (e.g., in the `ISSUE_ARCHIVE`) and supports finding files by their issue ID prefix.
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
     * Recursively searches for a file within a directory and its subdirectories.
     * @param {string} directory The directory to start the search from.
     * @param {string} filename  The name of the file to find.
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

    /**
     * Finds and returns the content of a local issue file by its number.
     *
     * Read-path dual-search per Epic #11187 B2 (#11285): during the active-to-archive
     * migration transition, an archived issue may live under either the new
     * canonical archiveRoot or the legacy archiveDir. The lookup tries new-first,
     * then falls back to legacy. Once the B1 corpus migration completes, the
     * legacy fallback becomes a no-op cheap miss.
     *
     * @param {string} issueNumber The issue number, with or without a leading '#'.
     * @returns {Promise<object>} A promise that resolves to the file content or a structured error.
     */
    async getIssueById(issueNumber) {
        const normalizedId = issueNumber.startsWith('#') ? issueNumber.substring(1) : issueNumber;
        const filename     = `${aiConfig.issueSync.issueFilenamePrefix}${normalizedId}.md`;

        try {
            // 1. Check the active issues directory first.
            //    Active issues are stored chunked at `issuesDir/XXxx/issue-N.md` per the
            //    chunkPath utility (see #11129 unification). Mirrors the write-path
            //    symmetry from IssueSyncer.mjs#283 / #310.
            const activePath = path.join(aiConfig.issueSync.issuesDir, chunkPath(normalizedId), filename);
            if (await fs.pathExists(activePath)) {
                const content = await fs.readFile(activePath, 'utf-8');
                return { filePath: activePath, content };
            }

            // 2. Dual-search archive paths: try new canonical `archiveRoot` first,
            //    fall back to legacy `archiveDir`. Once Epic #11187 B1 data migration
            //    completes, the legacy fallback becomes a cheap miss.
            let archivePath = await this.#findFileRecursively(aiConfig.issueSync.archiveRoot, filename);

            if (!archivePath) {
                archivePath = await this.#findFileRecursively(aiConfig.issueSync.archiveDir, filename);
            }

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
     * Finds and returns the content of a local discussion file by its number.
     *
     * Read-path dual-search per Epic #11187 B2 (#11285): the active discussions
     * directory is in transition from legacy XXxx subdirs to flat-root shape (B1
     * /AC6). Until B1 corpus collapse completes, an active discussion may live
     * either at the new flat path (`discussionsDir/discussion-N.md`) or under a
     * legacy XXxx subdir (`discussionsDir/XXxx/discussion-N.md`). The lookup
     * tries flat-first, then recurses into subdirs as fallback. Archive side
     * uses the new canonical `archiveRoot` only — no legacy discussion-archive
     * substrate ever existed per Epic #11187 body.
     *
     * @param {string} discussionNumber The discussion number, with or without a leading '#'.
     * @returns {Promise<object>} A promise that resolves to the file content or a structured error.
     */
    async getDiscussionById(discussionNumber) {
        const normalizedId = discussionNumber.startsWith('#') ? discussionNumber.substring(1) : discussionNumber;
        const filename     = `${aiConfig.issueSync.discussionFilenamePrefix}${normalizedId}.md`;

        try {
            // 1. Check the active discussions flat path first (new canonical shape post-B1).
            const activeFlatPath = path.join(aiConfig.issueSync.discussionsDir, filename);
            if (await fs.pathExists(activeFlatPath)) {
                const content = await fs.readFile(activeFlatPath, 'utf-8');
                return { filePath: activeFlatPath, content };
            }

            // 2. Active dual-search fallback: recurse into legacy XXxx subdirs of discussionsDir
            //    until Epic #11187 B1 corpus collapse lands. Post-B1 this becomes a cheap miss.
            const activeLegacyPath = await this.#findFileRecursively(aiConfig.issueSync.discussionsDir, filename);

            if (activeLegacyPath && activeLegacyPath !== activeFlatPath) {
                const content = await fs.readFile(activeLegacyPath, 'utf-8');
                return { filePath: activeLegacyPath, content };
            }

            // 3. If not found in active, search the archive directory recursively.
            //    No legacy discussion-archive substrate ever existed (per Epic #11187 body);
            //    archiveRoot only.
            const archivePath = await this.#findFileRecursively(aiConfig.issueSync.archiveRoot, filename);

            if (archivePath) {
                const content = await fs.readFile(archivePath, 'utf-8');
                return { filePath: archivePath, content };
            }

            // 4. If not found anywhere, return an error
            logger.warn(`[LocalFileService] Discussion file not found for #${normalizedId}`);
            return {
                error  : 'File not found',
                message: `No local markdown file found for discussion #${normalizedId}.`,
                code   : 'NOT_FOUND'
            };

        } catch (error) {
            logger.error(`[LocalFileService] Error getting discussion #${normalizedId}:`, error);
            return {
                error  : 'Internal server error',
                message: error.message,
                code   : 'SERVER_ERROR'
            };
        }
    }
}

export default Neo.setupClass(LocalFileService);
