import Base                         from './Base.mjs';
import fs                           from 'fs-extra';
import path                         from 'path';
import aiConfig                     from '../../../mcp/server/knowledge-base/config.mjs';
import {splitTicketArchiveMarkdown} from './ticketArchiveElementSplitter.mjs';

/**
 * @summary Extracts knowledge chunks from the Issue Archive.
 *
 * This source provider iterates through the `resources/content/archive/issues` directory structure,
 * which is organized by release versions and chunks (`vN.M.K/{flat|chunk-N}`). It extracts the content of closed issues,
 * providing deep historical context on past bug fixes, architectural decisions, and
 * feature implementations.
 *
 * @class Neo.ai.services.knowledge-base.source.TicketSource
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
            // entry.path is relative to contentRoot (e.g., 'issues/chunk-1/issue-1234.md')
            // Normalize it to match the suffix we check against
            map.set(path.normalize(entry.path), entry.id);
        }
    }

    return map;
};

class TicketSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.TicketSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.TicketSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from the Issue Archive.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        // Per-source paths (array) from the `sourcePaths` config (SSOT).
        const ticketPaths = aiConfig.sourcePaths.TicketSource;
        const targetPaths = ticketPaths.map(p => path.resolve(aiConfig.neoRootDir, p));

        const indexMap    = await loadIndexMap(aiConfig.neoRootDir, 'issues');
        const contentRoot = path.resolve(aiConfig.neoRootDir, 'resources/content');

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const ticketFiles = await fs.readdir(targetPath, { recursive: true });
                ticketFiles.sort();

                for (const file of ticketFiles) {
                    if (typeof file === 'string' && file.endsWith('.md')) {
                        const filePath          = path.join(targetPath, file);
                        const relativeToContent = path.relative(contentRoot, filePath);

                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            // Fallback if not in index map
                            id = path.basename(file).replace('.md', '').replace(/^issue-/, '');
                        }

                        const content = await fs.readFile(filePath, 'utf-8');
                        // Relative path keeps the distributed Chroma zip portable.
                        const source = path.relative(aiConfig.neoRootDir, filePath);
                        // Per-element chunks (body + each Timeline comment) keep a multi-cycle
                        // ticket under the embedding cap; a no-comment ticket yields one body chunk
                        // whose content equals the whole file.
                        const elements = splitTicketArchiveMarkdown(content);

                        for (const element of elements) {
                            const suffix = element.kind === 'body' ? 'body' : `comment-${element.ordinal}`;
                            const chunk = {
                                type: 'ticket',
                                kind: 'ticket',
                                name   : `issue-${id}#${suffix}`,
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

export default Neo.setupClass(TicketSource);
