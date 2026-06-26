import Base                             from './Base.mjs';
import fs                               from 'fs-extra';
import path                             from 'path';
import aiConfig                         from '../../../mcp/server/knowledge-base/config.mjs';
import {splitDiscussionArchiveMarkdown} from './discussionArchiveElementSplitter.mjs';

/**
 * @summary Extracts knowledge chunks from the active and archived GitHub Discussions.
 *
 * This source provider iterates through the `resources/content/discussions` directory,
 * providing deep historical context on architectural brainstorming,
 * proposals, and high-level agent communications.
 *
 * @class Neo.ai.services.knowledge-base.source.DiscussionSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
const loadIndexMap = async (neoRootDir, type) => {
    const map = new Map();
    const typeIndex = path.resolve(neoRootDir, `resources/content/${type}/_index.json`);
    const rootIndex = path.resolve(neoRootDir, 'resources/content/_index.json');

    let entries = [];
    if (await fs.pathExists(typeIndex)) {
        entries = JSON.parse(await fs.readFile(typeIndex, 'utf-8'));
    } else if (await fs.pathExists(rootIndex)) {
        const rootEntries = JSON.parse(await fs.readFile(rootIndex, 'utf-8'));
        entries = rootEntries.filter(e => e.type === type);
    }

    for (const entry of entries) {
        if (entry.path) {
            map.set(path.normalize(entry.path), entry.id);
        }
    }

    return map;
};

class DiscussionSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.DiscussionSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.DiscussionSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from local Markdown Discussions.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        // Per-source paths (array) from the `sourcePaths` config (SSOT). Each entry is resolved
        // against `neoRootDir`.
        const discussionPaths = aiConfig.sourcePaths.DiscussionSource;
        const targetPaths     = discussionPaths.map(p => path.resolve(aiConfig.neoRootDir, p));

        const indexMap    = await loadIndexMap(aiConfig.neoRootDir, 'discussions');
        const contentRoot = path.resolve(aiConfig.neoRootDir, 'resources/content');

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const discussionFiles = await fs.readdir(targetPath, { recursive: true });
                discussionFiles.sort();

                for (const file of discussionFiles) {
                    if (typeof file === 'string' && file.endsWith('.md')) {
                        const filePath          = path.join(targetPath, file);
                        const relativeToContent = path.relative(contentRoot, filePath);

                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            id = path.basename(file).replace('.md', '').replace(/^discussion-/, '');
                        }

                        const content = await fs.readFile(filePath, 'utf-8');
                        // Relative path keeps the distributed Chroma zip portable.
                        const source = path.relative(aiConfig.neoRootDir, filePath);
                        // Per-element chunks (body + each comment) keep a large converged Discussion
                        // under the embedding cap; a no-comment discussion yields one body chunk whose
                        // content equals the whole file.
                        const elements = splitDiscussionArchiveMarkdown(content);

                        for (const element of elements) {
                            const suffix = element.kind === 'body' ? 'body' : `comment-${element.ordinal}`;
                            const chunk = {
                                type: 'discussion',
                                kind: 'discussion',
                                name   : `discussion-${id}#${suffix}`,
                                content: element.content,
                                source
                            };

                            chunk.hash = createHashFn(chunk);
                            writeStream.write(JSON.stringify(chunk) + '\n');
                            count++;
                        }
                    }
                }
            }
        }

        return count;
    }
}

export default Neo.setupClass(DiscussionSource);
