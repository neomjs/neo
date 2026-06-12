import Base                from './Base.mjs';
import DocumentationParser from '../parser/DocumentationParser.mjs';
import fs                  from 'fs-extra';
import path                from 'path';
import aiConfig            from '../../../mcp/server/knowledge-base/config.mjs';

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
 * @class Neo.ai.services.knowledge-base.source.LearningSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class LearningSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.LearningSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.LearningSource',
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
        // Per-source path from the `sourcePaths` config (SSOT). The value points at the tree.json
        // file; the base directory containing the .md files is its containing directory.
        const learnTreeRelative = aiConfig.sourcePaths.LearningSource;
        const learnTreePath     = path.resolve(aiConfig.neoRootDir, learnTreeRelative);
        const learnBaseRelative = path.dirname(learnTreeRelative);

        if (await fs.pathExists(learnTreePath)) {
            const learnTree         = await fs.readJson(learnTreePath);
            const learnBasePath     = path.resolve(aiConfig.neoRootDir, learnBaseRelative);
            const filteredLearnData = learnTree.data.filter(item => item.id !== 'comparisons' && item.parentId !== 'comparisons');

            for (const item of filteredLearnData) {
                if (item.id && item.isLeaf !== false) {
                    const filePath = path.join(learnBasePath, `${item.id}.md`);
                    if (await fs.pathExists(filePath)) {
                        const content = await fs.readFile(filePath, 'utf-8');
                        // Pass the neoRootDir-relative path so stored chunk metadata stays
                        // portable across distributed Chroma zips. fs.readFile above
                        // still uses the absolute path internally.
                        const chunks  = DocumentationParser.parse(item, content, path.relative(aiConfig.neoRootDir, filePath));

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
