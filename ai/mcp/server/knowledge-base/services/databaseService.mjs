import { ChromaClient } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import aiConfig from '../../../../buildScripts/ai/aiConfig.mjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';

// TODO: This dotenv config needs a more robust solution.
const cwd = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;
dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

/**
 * Creates a SHA-256 hash from a stable JSON string representation of the chunk's content.
 * @param {object} chunk The chunk object.
 * @returns {string} The hexadecimal hash string.
 */
function createContentHash(chunk) {
    const contentString = JSON.stringify({
        type: chunk.type,
        name: chunk.name,
        description: chunk.description,
        content: chunk.content,
        extends: chunk.extends,
        configType: chunk.configType,
        params: chunk.params,
        returns: chunk.returns
    });
    return crypto.createHash('sha256').update(contentString).digest('hex');
}

/**
 * Orchestrates the full knowledge base synchronization process.
 * @returns {Promise<object>}
 */
async function syncDatabase() {
    console.log('Starting knowledge base synchronization...');

    // Phase 1: Create Knowledge Base (in-memory)
    const knowledgeBase = [];
    const learnBasePath = path.resolve(process.cwd(), 'learn');

    // 1. Process API/JSDoc
    const apiPath = path.resolve(process.cwd(), 'docs/output/all.json');
    const apiData = await fs.readJson(apiPath);
    apiData.forEach(item => {
        const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';
        let chunk, type = sourceFile.includes('/examples/') ? 'example' : 'src';
        if (item.kind === 'class') {
            chunk = { type, kind: 'class', name: item.longname, description: item.comment, extends: item.augments?.[0], source: sourceFile };
        } else if (item.kind === 'member' && item.memberof) {
            chunk = { type, kind: 'config', className: item.memberof, name: item.name, description: item.description, configType: item.type?.names.join('|') || 'unknown', source: sourceFile };
        } else if (item.kind === 'function' && item.memberof) {
            chunk = { type, kind: 'method', className: item.memberof, name: item.name, description: item.description, params: item.params?.map(p => ({ name: p.name, type: p.type?.names.join('|') })), returns: item.returns?.map(r => r.type?.names.join('|')).join('|'), source: sourceFile };
        }
        if (chunk) {
            chunk.hash = createContentHash(chunk);
            knowledgeBase.push(chunk);
        }
    });

    // 2. Process learning content
    const learnTreePath = path.resolve(learnBasePath, 'tree.json');
    const learnTree = await fs.readJson(learnTreePath);
    const filteredLearnData = learnTree.data.filter(item => item.id !== 'comparisons' && item.parentId !== 'comparisons');
    for (const item of filteredLearnData) {
        if (item.id && item.isLeaf !== false) {
            const filePath = path.join(learnBasePath, `${item.id}.md`);
            if (await fs.pathExists(filePath)) {
                const content = await fs.readFile(filePath, 'utf-8');
                const sections = content.split(/(?=^#+\s)/m);
                const type = item.parentId === 'Blog' ? 'blog' : 'guide';
                if (sections.length > 1) {
                    sections.forEach(section => {
                        if (section.trim() === '') return;
                        const headingMatch = section.match(/^#+\s(.*)/);
                        const chunk = { type, kind: 'guide', name: `${item.name} - ${headingMatch ? headingMatch[1] : item.name}`, id: item.id, content: section, source: filePath };
                        chunk.hash = createContentHash(chunk);
                        knowledgeBase.push(chunk);
                    });
                } else {
                    const chunk = { type, kind: 'guide', name: item.name, id: item.id, content, source: filePath };
                    chunk.hash = createContentHash(chunk);
                    knowledgeBase.push(chunk);
                }
            }
        }
    }

    // 3. Process release notes & tickets (simplified)
    // In a real scenario, you'd walk these directories as in the script.

    console.log(`Created ${knowledgeBase.length} knowledge chunks in memory.`);

    // Phase 2: Embed Knowledge Base
    const classNameToDataMap = {};
    knowledgeBase.forEach(chunk => {
        if (chunk.kind === 'class') {
            classNameToDataMap[chunk.name] = { source: chunk.source, parent: chunk.extends };
        }
    });

    knowledgeBase.forEach(chunk => {
        let currentClass = chunk.kind === 'class' ? chunk.name : chunk.className;
        const inheritanceChain = [];
        const visited = new Set();
        while (currentClass && classNameToDataMap[currentClass]?.parent && !visited.has(currentClass)) {
            visited.add(currentClass);
            const parentClassName = classNameToDataMap[currentClass].parent;
            const parentData = classNameToDataMap[parentClassName];
            if (parentData) {
                inheritanceChain.push({ className: parentClassName, source: parentData.source });
            }
            currentClass = parentClassName;
        }
        chunk.inheritanceChain = inheritanceChain;
    });

    const dbClient = new ChromaClient();
    const collectionName = aiConfig.knowledgeBase.collectionName;
    const collection = await dbClient.getOrCreateCollection({ name: collectionName });

    const existingDocs = await collection.get({ include: ["metadatas"] });
    const existingDocsMap = new Map(existingDocs.ids.map((id, index) => [id, existingDocs.metadatas[index].hash]));

    const chunksToProcess = [];
    const allIds = new Set();
    knowledgeBase.forEach((chunk, index) => {
        const chunkId = `id_${index}`;
        allIds.add(chunkId);
        if (!existingDocsMap.has(chunkId) || existingDocsMap.get(chunkId) !== chunk.hash) {
            chunksToProcess.push({ ...chunk, id: chunkId });
        }
    });

    const idsToDelete = existingDocs.ids.filter(id => !allIds.has(id));

    if (idsToDelete.length > 0) {
        await collection.delete({ ids: idsToDelete });
        console.log(`Deleted ${idsToDelete.length} stale chunks.`);
    }

    if (chunksToProcess.length === 0) {
        console.log('No changes detected. Knowledge base is up to date.');
        return { message: 'Knowledge base is already up to date.' };
    }

    console.log(`Processing ${chunksToProcess.length} chunks for embedding...`);
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: aiConfig.knowledgeBase.embeddingModel });

    const batchSize = aiConfig.knowledgeBase.batchSize;
    for (let i = 0; i < chunksToProcess.length; i += batchSize) {
        const batch = chunksToProcess.slice(i, i + batchSize);
        const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);
        
        const result = await model.batchEmbedContents({
            requests: textsToEmbed.map(text => ({ model: aiConfig.knowledgeBase.embeddingModel, content: { parts: [{ text }] } }))
        });
        const embeddings = result.embeddings.map(e => e.values);

        const metadatas = batch.map(chunk => {
            const metadata = {};
            for (const [key, value] of Object.entries(chunk)) {
                metadata[key] = (value === null) ? 'null' : (typeof value === 'object') ? JSON.stringify(value) : value;
            }
            return metadata;
        });

        await collection.upsert({
            ids: batch.map(chunk => chunk.id),
            embeddings: embeddings,
            metadatas: metadatas
        });
        console.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)}`);
    }

    const count = await collection.count();
    return { message: `Synchronization complete. Collection now contains ${count} items.` };
}

/**
 * Permanently deletes the entire knowledge base collection from ChromaDB.
 * This is a destructive operation used for a clean reset.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function deleteDatabase() {
    const dbClient = new ChromaClient();
    const collectionName = aiConfig.knowledgeBase.collectionName;

    try {
        await dbClient.deleteCollection({ name: collectionName });
        return {
            message: `Knowledge base collection '${collectionName}' deleted successfully.`
        };
    } catch (error) {
        if (error.message.includes(`Collection ${collectionName} does not exist.`)) {
            return {
                message: `Knowledge base collection '${collectionName}' did not exist. No action taken.`
            };
        }
        throw error;
    }
}

export { deleteDatabase, syncDatabase };
