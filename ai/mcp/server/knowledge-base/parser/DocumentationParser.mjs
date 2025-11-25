import Base from '../../../../../src/core/Base.mjs';

const sectionsRegex = /(?=^#+\s)/m;

/**
 * @summary Extracts knowledge chunks from Markdown documentation files.
 *
 * This parser processes Markdown files (Guides, Blogs) found in the `learn/` directory.
 * Its primary goal is to split long documents into smaller, semantically distinct
 * chunks based on header sections (e.g., `#`, `##`).
 *
 * This granular chunking improves vector search relevance by allowing queries to match
 * specific sections of a guide rather than the entire document. It assigns the correct
 * `type` ('guide' or 'blog') based on the file's location in the learning tree.
 *
 * @class Neo.ai.mcp.server.knowledge-base.parser.DocumentationParser
 * @extends Neo.core.Base
 * @singleton
 */
class DocumentationParser extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.parser.DocumentationParser'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.parser.DocumentationParser',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Parses a Markdown file into granular chunks based on headers.
     * @param {Object} item The item metadata from tree.json.
     * @param {String} content The raw file content.
     * @param {String} filePath The absolute file path.
     * @returns {Array<Object>} An array of chunks.
     */
    parse(item, content, filePath) {
        const chunks   = [];
        const sections = content.split(sectionsRegex);
        const type     = item.parentId === 'Blog' ? 'blog' : 'guide';

        if (sections.length > 1) {
            sections.forEach(section => {
                if (section.trim() === '') return;
                const headingMatch = section.match(/^#+\s(.*)/);
                const chunk = {
                    type,
                    kind   : 'guide',
                    name   : `${item.name} - ${headingMatch ? headingMatch[1] : item.name}`,
                    id     : item.id,
                    content: section,
                    source : filePath
                };
                chunks.push(chunk);
            });
        } else {
            const chunk = {
                type,
                kind  : 'guide',
                name  : item.name,
                id    : item.id,
                content,
                source: filePath
            };
            chunks.push(chunk);
        }

        return chunks;
    }
}

export default Neo.setupClass(DocumentationParser);
