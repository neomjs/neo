import fs from 'fs-extra';
import path from 'path';

/**
 * This script processes and unifies the framework's existing knowledge sources into a format suitable for AI consumption.
 * It uses the pre-generated `docs/output/all.json` for API and JSDoc information, and `learn/tree.json`
 * to parse the conceptual learning guides.
 * @buildScripts/buildESModules.mjs NeoStudio.buildScripts.createKnowledgeBase
 */
class CreateKnowledgeBase {
    static async run() {
        console.log('Starting knowledge base creation...');
        const chunks = [];

        // 1. Process the consolidated API/JSDoc file
        const apiPath = path.resolve(process.cwd(), 'docs/output/all.json');
        const apiData = await fs.readJson(apiPath);

        apiData.forEach(item => {
            const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';

            if (item.kind === 'class') {
                chunks.push({
                    type: 'class',
                    name: item.longname,
                    description: item.comment,
                    extends: item.augments?.[0], // Capture the parent class
                    source: sourceFile
                });
            } else if (item.kind === 'member' && item.memberof) {
                chunks.push({
                    type: 'config',
                    className: item.memberof,
                    name: item.name,
                    description: item.description,
                    configType: item.type?.names.join('|') || 'unknown',
                    source: sourceFile
                });
            } else if (item.kind === 'function' && item.memberof) {
                chunks.push({
                    type: 'method',
                    className: item.memberof,
                    name: item.name,
                    description: item.description,
                    params: item.params?.map(p => ({ name: p.name, type: p.type?.names.join('|') })),
                    returns: item.returns?.map(r => r.type?.names.join('|')).join('|'),
                    source: sourceFile
                });
            }
        });
        console.log(`Processed ${chunks.length} API/JSDoc chunks.`);

        // 2. Process the learning content, splitting guides into chunks by headings
        const learnTreePath = path.resolve(process.cwd(), 'learn/tree.json');
        const learnTree = await fs.readJson(learnTreePath);
        const learnBasePath = path.resolve(process.cwd(), 'learn');
        let guideChunks = 0;

        for (const item of learnTree.data) {
            if (item.id && item.isLeaf !== false) { // Process files (leaves or items without isLeaf property)
                const filePath = path.join(learnBasePath, `${item.id}.md`);
                if (await fs.pathExists(filePath)) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const sections = content.split(/(?=^#+\s)/m); // Split by markdown headings

                    if (sections.length > 1) {
                        sections.forEach(section => {
                            if (section.trim() === '') return;
                            const headingMatch = section.match(/^#+\s(.*)/);
                            const heading = headingMatch ? headingMatch[1] : item.name;
                            const chunkName = `${item.name} - ${heading}`;

                            chunks.push({
                                type: 'guide',
                                name: chunkName,
                                id: item.id,
                                isBlog: item.parentId === 'Blog',
                                content: section,
                                source: filePath
                            });
                            guideChunks++;
                        });
                    } else {
                        // If no headings, add the whole file as one chunk
                        chunks.push({
                            type: 'guide',
                            name: item.name,
                            id: item.id,
                            isBlog: item.parentId === 'Blog',
                            content: content,
                            source: filePath
                        });
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