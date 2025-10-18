import { ChromaClient } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import aiConfig from '../../config.mjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import logger from '../../logger.mjs';
import path from 'path';
import readline from 'readline';

// TODO: This dotenv config needs a more robust solution for server environments.
const cwd = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;
dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

const sectionsRegex = /(?=^#+\s)/m;

/**
 * Creates a SHA-256 hash from a stable JSON string representation of a chunk's content.
 * This hash is used to detect changes in content without having to compare the full text.
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
 * Parses all knowledge sources (JSDoc, guides, release notes, tickets) and generates
 * a structured JSONL file at `dist/ai-knowledge-base.jsonl`.
 * 
 * This function acts as the "compiler" for the knowledge base. Its primary role is to
 * read from various source-of-truth files and convert them into a unified, structured format.
 * It uses a write stream to handle potentially large amounts of data efficiently without
 * holding everything in memory at once.
 * 
 * @returns {Promise<object>} A promise that resolves to a success message with the total chunk count.
 */
async function createKnowledgeBase() {
    logger.log('Starting knowledge base file creation...');
    const outputPath = aiConfig.knowledgeBase.path;
    await fs.ensureDir(path.dirname(outputPath));
    const writeStream = fs.createWriteStream(outputPath);
    let totalChunks = 0;

    // 1. Process JSDoc API data
    const apiPath = path.resolve(process.cwd(), 'docs/output/all.json');
    if (await fs.pathExists(apiPath)) {
        const apiData = await fs.readJson(apiPath);
        apiData.forEach(item => {
            const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';
            let chunk, type = sourceFile.includes('/examples/') ? 'example' : 'src';
            if (item.kind === 'class') {
                chunk = {
                    type: type,
                    kind: 'class',
                    name: item.longname,
                    description: item.comment,
                    extends: item.augments?.[0],
                    source: sourceFile
                };
            } else if (item.kind === 'member' && item.memberof) {
                chunk = {
                    type: type,
                    kind: 'config',
                    className: item.memberof,
                    name: item.name,
                    description: item.description,
                    configType: item.type?.names.join('|') || 'unknown',
                    source: sourceFile
                };
            } else if (item.kind === 'function' && item.memberof) {
                chunk = {
                    type: type,
                    kind: 'method',
                    className: item.memberof,
                    name: item.name,
                    description: item.description,
                    params: item.params?.map(p => ({ name: p.name, type: p.type?.names.join('|') })),
                    returns: item.returns?.map(r => r.type?.names.join('|')).join('|'),
                    source: sourceFile
                };
            }
            if (chunk) {
                chunk.hash = createContentHash(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                totalChunks++;
            }
        });
    }

    // 2. Process Markdown learning content
    const learnTreePath = path.resolve(process.cwd(), 'learn/tree.json');
    if (await fs.pathExists(learnTreePath)) {
        const learnTree = await fs.readJson(learnTreePath);
        const learnBasePath = path.resolve(process.cwd(), 'learn');
        const filteredLearnData = learnTree.data.filter(item => item.id !== 'comparisons' && item.parentId !== 'comparisons');
        for (const item of filteredLearnData) {
            if (item.id && item.isLeaf !== false) {
                const filePath = path.join(learnBasePath, `${item.id}.md`);
                if (await fs.pathExists(filePath)) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const sections = content.split(sectionsRegex);
                    const type = item.parentId === 'Blog' ? 'blog' : 'guide';
                    if (sections.length > 1) {
                        sections.forEach(section => {
                            if (section.trim() === '') return;
                            const headingMatch = section.match(/^#+\s(.*)/);
                            const chunk = { type, kind: 'guide', name: `${item.name} - ${headingMatch ? headingMatch[1] : item.name}`, id: item.id, content: section, source: filePath };
                            chunk.hash = createContentHash(chunk);
                            writeStream.write(JSON.stringify(chunk) + '\n');
                            totalChunks++;
                        });
                    } else {
                        const chunk = { type, kind: 'guide', name: item.name, id: item.id, content, source: filePath };
                        chunk.hash = createContentHash(chunk);
                        writeStream.write(JSON.stringify(chunk) + '\n');
                        totalChunks++;
                    }
                }
            }
        }
    }

    // 3. Process Release Notes
    const releaseNotesPath = path.resolve(process.cwd(), '.github/RELEASE_NOTES');
    if (await fs.pathExists(releaseNotesPath)) {
        const releaseFiles = await fs.readdir(releaseNotesPath);
        for (const file of releaseFiles) {
            if (file.endsWith('.md')) {
                const filePath = path.join(releaseNotesPath, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const chunk = { type: 'release', kind: 'release', name: file.replace('.md', ''), content, source: filePath };
                chunk.hash = createContentHash(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                totalChunks++;
            }
        }
    }

    // 4. Process Ticket Archives
    const ticketArchivePath = path.resolve(process.cwd(), '.github/ISSUE_ARCHIVE');
    if (await fs.pathExists(ticketArchivePath)) {
        const releaseVersions = await fs.readdir(ticketArchivePath);
        for (const version of releaseVersions) {
            const versionPath = path.join(ticketArchivePath, version);
            if ((await fs.stat(versionPath)).isDirectory()) {
                const ticketFiles = await fs.readdir(versionPath);
                for (const file of ticketFiles) {
                    if (file.endsWith('.md')) {
                        const filePath = path.join(versionPath, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const titleMatch = content.match(/^# Ticket: (.*)/m);
                        const chunk = { type: 'ticket', kind: 'ticket', name: titleMatch ? titleMatch[1] : file.replace('.md', ''), content, source: filePath };
                        chunk.hash = createContentHash(chunk);
                        writeStream.write(JSON.stringify(chunk) + '\n');
                        totalChunks++;
                    }
                }
            }
        }
    }

    return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
            const message = `Knowledge base file created with ${totalChunks} chunks.`;
            logger.log(message);
            resolve({ message });
        });
        writeStream.on('error', reject);
        writeStream.end();
    });
}

/**
 * Reads the generated JSONL file, enriches the data (e.g., with class inheritance chains),
 * generates vector embeddings for new/changed content, and upserts the data into the ChromaDB collection.
 * 
 * This function is intentionally memory-intensive. It loads the entire knowledge base into memory
 * to perform holistic analysis, such as building the class inheritance map. This heavy, one-time
 * pre-calculation makes the query-time scoring significantly faster.
 * 
 * It performs a diff against the existing database content to ensure idempotency, only processing
 * chunks that are new or have changed, which saves significant time and API costs.
 * 
 * @returns {Promise<object>} A promise that resolves to a success message with the final document count.
 */
async function embedKnowledgeBase() {
    logger.log('Starting knowledge base embedding...');
    const knowledgeBasePath = aiConfig.knowledgeBase.path;
    if (!await fs.pathExists(knowledgeBasePath)) {
        throw new Error(`Knowledge base file not found at ${knowledgeBasePath}. Please run createKnowledgeBase first.`);
    }

    const knowledgeBase = [];
    const fileStream = fs.createReadStream(knowledgeBasePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        knowledgeBase.push(JSON.parse(line));
    }
    logger.log(`Loaded ${knowledgeBase.length} knowledge chunks from file.`);

    // Build the inheritance map
    const classNameToDataMap = {};
    knowledgeBase.forEach(chunk => {
        if (chunk.kind === 'class') {
            classNameToDataMap[chunk.name] = { source: chunk.source, parent: chunk.extends };
        }
    });

    // Pre-calculate inheritance chains for all chunks
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

    // A dummy embedding function to satisfy the ChromaDB API, since we provide our own embeddings.
    // This is a workaround for the client's expectation of an embedding function, even when
    // we are supplying pre-computed embedding vectors directly.
    const embeddingFunction = {
        generate: (texts) => {
            // This will not be called because we provide embeddings directly.
            console.error('Dummy embedding function called. This should not happen.');
            return Promise.resolve(texts.map(() => []));
        }
    };

    // The console override suppresses a noisy and irrelevant warning from the ChromaDB client
    // about a missing embedding function, which we are intentionally not providing.
    const originalLog = console.log;
    console.log = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('No embedding function configuration found')) {
            return;
        }
        originalLog.apply(console, args);
    };

    const collection = await dbClient.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: embeddingFunction
    });

    console.log = originalLog;

    logger.log(`Using collection: ${collectionName}`);

    // 1. Fetch existing documents for comparison
    logger.log('Fetching existing documents from ChromaDB...');
    const existingDocs = await collection.get({ include: ["metadatas"] });
    const existingDocsMap = new Map();

    existingDocs.ids.forEach((id, index) => {
        existingDocsMap.set(id, existingDocs.metadatas[index].hash);
    });
    logger.log(`Found ${existingDocsMap.size} existing documents.`);

    // 2. Prepare for diffing
    const chunksToProcess = [];
    const allIds = new Set();

    // 3. Compare new chunks with existing ones
    knowledgeBase.forEach((chunk, index) => {
        const chunkId = `id_${index}`;
        allIds.add(chunkId);
        if (!existingDocsMap.has(chunkId) || existingDocsMap.get(chunkId) !== chunk.hash) {
            chunksToProcess.push({ ...chunk, id: chunkId });
        }
    });

    const idsToDelete = existingDocs.ids.filter(id => !allIds.has(id));

    logger.log(`${chunksToProcess.length} chunks to add or update.`);
    logger.log(`${idsToDelete.length} chunks to delete.`);

    // 4. Perform deletions
    if (idsToDelete.length > 0) {
        await collection.delete({ ids: idsToDelete });
        logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
    }

    // 5. Process additions and updates
    if (chunksToProcess.length === 0) {
        const message = 'No changes detected. Knowledge base is up to date.';
        logger.log(message);
        return { message };
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: aiConfig.knowledgeBase.embeddingModel });
    logger.log(`Initialized Google AI embedding model: ${aiConfig.knowledgeBase.embeddingModel}.`);

    logger.log('Embedding chunks...');
    const batchSize = aiConfig.knowledgeBase.batchSize;
    const maxRetries = aiConfig.knowledgeBase.maxRetries;

    for (let i = 0; i < chunksToProcess.length; i += batchSize) {
        const batch = chunksToProcess.slice(i, i + batchSize);
        const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);

        let retries = 0;
        let success = false;

        // The retry loop makes the embedding process resilient to transient network errors
        // or API rate limits from the embedding provider. It uses exponential backoff
        // to avoid overwhelming the service on repeated failures.
        while (retries < maxRetries && !success) {
            try {
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
                logger.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)}`);
                success = true;
            } catch (err) {
                retries++;
                console.error(`An error occurred during embedding batch ${i / batchSize + 1}. Retrying (${retries}/${maxRetries})...`, err.message);
                if (retries < maxRetries) {
                    await new Promise(res => setTimeout(res, 2 ** retries * 1000)); // Exponential backoff
                } else {
                    console.error(`Failed to process batch ${i / batchSize + 1} after ${maxRetries} retries. Skipping.`);
                }
            }
        }
    }

    const count = await collection.count();
    const message = `Embedding complete. Collection now contains ${count} items.`;
    logger.log(message);
    return { message };
}

/**
 * A convenience orchestrator that runs the entire knowledge base synchronization process.
 * It first creates the knowledge base file and then embeds its content into the vector database.
 * This provides a simple, single-command way to update the knowledge base from scratch.
 * @returns {Promise<object>} A promise that resolves to the final success message from the embedding step.
 */
async function syncDatabase() {
    logger.log('Starting full database synchronization...');
    await createKnowledgeBase();
    return await embedKnowledgeBase();
}

/**
 * Permanently deletes the entire knowledge base collection from ChromaDB.
 * This is a destructive but necessary operation for performing a clean reset of the knowledge base.
 * It handles cases where the collection may not exist gracefully.
 * @returns {Promise<object>} A promise that resolves to a success message.
 */
async function deleteDatabase() {
    const dbClient = new ChromaClient();
    const collectionName = aiConfig.knowledgeBase.collectionName;
    try {
        await dbClient.deleteCollection({ name: collectionName });
        const message = `Knowledge base collection '${collectionName}' deleted successfully.`;
        logger.log(message);
        return { message };
    } catch (error) {
        if (error.message.includes(`Collection ${collectionName} does not exist.`)) {
            const message = `Knowledge base collection '${collectionName}' did not exist. No action taken.`;
            logger.log(message);
            return { message };
        }
        throw error;
    }
}

export { createKnowledgeBase, deleteDatabase, embedKnowledgeBase, syncDatabase };