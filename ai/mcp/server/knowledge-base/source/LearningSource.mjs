import Base                from './Base.mjs';
import DocumentationParser from '../parser/DocumentationParser.mjs';
import fs                  from 'fs-extra';
import path                from 'path';

/**
 * @summary Extracts knowledge chunks from the 'learn/' directory.
 *
 * This source provider traverses the `learn/tree.json` structure to locate and read
 * Markdown files (Guides and Blogs). It delegates the content parsing to `DocumentationParser`,
 * which handles the logic of splitting files into smaller sections.
 *
 * By decoupling the file traversal from the core service, this class simplifies the
 * addition of new documentation structures or file formats in the future.
 *
 * @class Neo.ai.mcp.server.knowledge-base.source.LearningSource
 * @extends Neo.ai.mcp.server.knowledge-base.source.Base
 * @singleton
 */
class LearningSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.LearningSource'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.LearningSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from the 'learn/' directory based on tree.json.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const learnTreePath = path.resolve(process.cwd(), 'learn/tree.json');

        if (await fs.pathExists(learnTreePath)) {
            const learnTree         = await fs.readJson(learnTreePath);
            const learnBasePath     = path.resolve(process.cwd(), 'learn');
            const filteredLearnData = learnTree.data.filter(item => item.id !== 'comparisons' && item.parentId !== 'comparisons');

            for (const item of filteredLearnData) {
                if (item.id && item.isLeaf !== false) {
                    const filePath = path.join(learnBasePath, `${item.id}.md`);
                    if (await fs.pathExists(filePath)) {
                        const content = await fs.readFile(filePath, 'utf-8');
                        const chunks  = DocumentationParser.parse(item, content, filePath);

                        chunks.forEach(chunk => {
                            chunk.hash = createHashFn(chunk);
                            writeStream.write(JSON.stringify(chunk) + '\n');
                            count++;
                        });
                    }
                }
            }
        }

        return count;
    }
}

export default Neo.setupClass(LearningSource);
