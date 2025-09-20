import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';

const sectionsRegex = /(?=^#+\s)/m;

/**
 * Creates a SHA-256 hash from a stable JSON string representation of the chunk's content.
 * @param {object} chunk The chunk object.
 * @returns {string} The hexadecimal hash string.
 */
function createContentHash(chunk) {
    // Create a stable string representation of the content that affects embedding
    const contentString = JSON.stringify({
        type       : chunk.type,
        name       : chunk.name,
        description: chunk.description,
        content    : chunk.content,
        // Include other relevant fields that define the chunk's content
        extends    : chunk.extends,
        configType : chunk.configType,
        params     : chunk.params,
        returns    : chunk.returns
    });

    return crypto.createHash('sha256').update(contentString).digest('hex');
}

/**
 * This script processes and unifies the framework's existing knowledge sources into a format suitable for AI consumption.
 * It uses the pre-generated `docs/output/all.json` for API and JSDoc information, and `learn/tree.json`
 * to parse the conceptual learning guides.
 * @class CreateKnowledgeBase
 */
class CreateKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base creation...');
        const
            chunks  = [],
            // 1. Process the consolidated API/JSDoc file
            apiPath = path.resolve(process.cwd(), 'docs/output/all.json'),
            apiData = await fs.readJson(apiPath);

        apiData.forEach(item => {
            const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';

            if (item.kind === 'class') {
                const chunk = {
                    type       : 'class',
                    name       : item.longname,
                    description: item.comment,
                    extends    : item.augments?.[0], // Capture the parent class
                    source     : sourceFile
                };

                chunk.hash = createContentHash(chunk);
                chunks.push(chunk);
            } else if (item.kind === 'member' && item.memberof) {
                const chunk = {
                    type       : 'config',
                    className  : item.memberof,
                    name       : item.name,
                    description: item.description,
                    configType : item.type?.names.join('|') || 'unknown',
                    source     : sourceFile
                };

                chunk.hash = createContentHash(chunk);
                chunks.push(chunk);
            } else if (item.kind === 'function' && item.memberof) {
                const chunk = {
                    type       : 'method',
                    className  : item.memberof,
                    name       : item.name,
                    description: item.description,
                    params     : item.params?.map(p => ({name: p.name, type: p.type?.names.join('|')})),
                    returns    : item.returns?.map(r => r.type?.names.join('|')).join('|'),
                    source     : sourceFile
                };

                chunk.hash = createContentHash(chunk);
                chunks.push(chunk);
            }
        });

        console.log(`Processed ${chunks.length} API/JSDoc chunks.`);

        // 2. Process the learning content, splitting guides into chunks by headings
        const
            learnTreePath = path.resolve(process.cwd(), 'learn/tree.json'),
            learnTree     = await fs.readJson(learnTreePath),
            learnBasePath = path.resolve(process.cwd(), 'learn');

        const filteredLearnData = learnTree.data.filter(item => {
            return item.id !== 'comparisons' && item.parentId !== 'comparisons';
        });

        let guideChunks = 0;

        for (const item of filteredLearnData) {
            if (item.id && item.isLeaf !== false) { // Process files (leaves or items without isLeaf property)
                const filePath = path.join(learnBasePath, `${item.id}.md`);

                if (await fs.pathExists(filePath)) {
                    const
                        content  = await fs.readFile(filePath, 'utf-8'),
                        sections = content.split(sectionsRegex); // Split by markdown headings

                    if (sections.length > 1) {
                        sections.forEach(section => {
                            if (section.trim() === '') return;

                            const
                                headingMatch = section.match(/^#+\s(.*)/),
                                heading      = headingMatch ? headingMatch[1] : item.name,
                                chunkName    = `${item.name} - ${heading}`,
                                chunk        = {
                                    type   : 'guide',
                                    name   : chunkName,
                                    id     : item.id,
                                    isBlog : item.parentId === 'Blog',
                                    content: section,
                                    source : filePath
                                };

                            chunk.hash = createContentHash(chunk);
                            chunks.push(chunk);
                            guideChunks++;
                        });
                    } else {
                        // If no headings, add the whole file as one chunk
                        const chunk = {
                            type   : 'guide',
                            name   : item.name,
                            id     : item.id,
                            isBlog : item.parentId === 'Blog',
                            content: content,
                            source : filePath
                        };

                        chunk.hash = createContentHash(chunk);
                        chunks.push(chunk);
                        guideChunks++;
                    }
                }
            }
        }

        console.log(`Processed ${guideChunks} learning content chunks. Total chunks: ${chunks.length}.`);

        // 3. Save the unified chunks
        const outputPath = path.resolve(process.cwd(), 'dist/ai-knowledge-base.json');
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeJson(outputPath, chunks, { spaces: 2 });
        console.log(`Knowledge base creation complete. Saved to ${outputPath}`);
    }
}

CreateKnowledgeBase.run().catch(err => {
    console.error(err);
    process.exit(1);
});
