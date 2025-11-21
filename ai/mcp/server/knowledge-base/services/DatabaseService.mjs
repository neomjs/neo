import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import crypto               from 'crypto';
import dotenv               from 'dotenv';
import fs                   from 'fs-extra';
import logger               from '../logger.mjs';
import path                 from 'path';
import readline             from 'readline';

const cwd       = process.cwd();
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;

dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

const sectionsRegex = /(?=^#+\s)/m;

/**
 * This service is the core engine for building and maintaining the AI's knowledge base.
 * It orchestrates the entire ETL (Extract, Transform, Load) process for knowledge and
 * ensures the database is synchronized on application startup.
 *
 * ### Key Responsibilities:
 * 1.  **Autonomous Startup:** On initialization, it automatically checks if the knowledge base
 *     is synchronized with the source files and runs the necessary embedding or creation
 *     processes to bring it up-to-date.
 * 2.  **ETL Pipeline:**
 *     - **Extract:** Reads from diverse source-of-truth files (`createKnowledgeBase`).
 *     - **Transform:** Parses and structures data into a unified JSONL format.
 *     - **Load:** Generates vector embeddings and upserts them into ChromaDB (`embedKnowledgeBase`).
 * 3.  **Lifecycle Management:** Provides methods for the full lifecycle of the knowledge base,
 *     from creation and synchronization to deletion.
 * @class Neo.ai.mcp.server.knowledge-base.services.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.DatabaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Orchestrates the automated startup synchronization of the knowledge base.
     *
     * This method is called automatically by the framework after the service is constructed.
     * It ensures that the knowledge base is ready and up-to-date before the application
     * proceeds.
     *
     * The logic is as follows:
     * 1. It first waits for the underlying database connection to be ready.
     * 2. It then checks for the existence of the `ai-knowledge-base.jsonl` file.
     * 3. If the file does not exist, it triggers a full `syncDatabase()` (create + embed).
     * 4. If the file exists, it triggers `embedKnowledgeBase()` to process any new or changed content.
     *
     * This entire process is awaited via the `ready()` promise on the service, ensuring
     * that dependent services or startup sequences only proceed once the knowledge base is
     * fully initialized.
     * @protected
     */
    async initAsync() {
        await super.initAsync();

        // Wait for ChromaManager (which waits for LifecycleService) to be ready
        await ChromaManager.ready();

        logger.info('[Startup] Checking knowledge base status...');
        const knowledgeBasePath = aiConfig.dataPath;
        const kbExists          = await fs.pathExists(knowledgeBasePath);

        try {
            if (!kbExists) {
                logger.info('[Startup] Knowledge base file not found. Starting full synchronization...');
                await this.syncDatabase();
                logger.info('✅ [Startup] Full synchronization complete.');
            } else {
                logger.info('[Startup] Knowledge base file found. Starting embedding process...');
                await this.embedKnowledgeBase();
                logger.info('✅ [Startup] Embedding process complete.');
            }
        } catch (error) {
            logger.warn('⚠️  [Startup] Knowledge base synchronization/embedding failed:', error.message);
        }
    }

    /**
     * Creates a SHA-256 hash from a stable JSON string representation of a chunk's content.
     * This hash is used to detect changes in content without having to compare the full text.
     * @param {object} chunk The chunk object.
     * @returns {string} The hexadecimal hash string.
     * @private
     */
    createContentHash(chunk) {
        const contentString = JSON.stringify({
            type       : chunk.type,
            name       : chunk.name,
            description: chunk.description,
            content    : chunk.content,
            extends    : chunk.extends,
            configType : chunk.configType,
            params     : chunk.params,
            returns    : chunk.returns
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
     * ### Key Characteristics:
     * - **Input:** Reads from `docs/output/all.json` for API data and `learn/tree.json` for the guide structure.
     * - **Processing:** It breaks down the content into logical "chunks" (e.g., a class, a method, a section of a guide).
     * - **Output:** It streams each chunk as a JSON object into the `dist/ai-knowledge-base.jsonl` file.
     *
     * @returns {Promise<object>} A promise that resolves to a success message with the total chunk count.
     */
    async createKnowledgeBase() {
        logger.log('Starting knowledge base file creation...');
        const outputPath = aiConfig.dataPath;
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
                        type,
                        kind       : 'class',
                        name       : item.longname,
                        description: item.comment,
                        extends    : item.augments?.[0],
                        source     : sourceFile
                    };
                } else if (item.kind === 'member' && item.memberof) {
                    chunk = {
                        type,
                        kind       : 'config',
                        className  : item.memberof,
                        name       : item.name,
                        description: item.description,
                        configType : item.type?.names.join('|') || 'unknown',
                        source     : sourceFile
                    };
                } else if (item.kind === 'function' && item.memberof) {
                    chunk = {
                        type,
                        kind       : 'method',
                        className  : item.memberof,
                        name       : item.name,
                        description: item.description,
                        params     : item.params?.map(p => ({name: p.name, type: p.type?.names.join('|')})),
                        returns    : item.returns?.map(r => r.type?.names.join('|')).join('|'),
                        source     : sourceFile
                    };
                }
                if (chunk) {
                    chunk.hash = this.createContentHash(chunk);
                    writeStream.write(JSON.stringify(chunk) + '\n');
                    totalChunks++;
                }
            });
        }

        // 2. Process Markdown learning content
        const learnTreePath = path.resolve(process.cwd(), 'learn/tree.json');
        if (await fs.pathExists(learnTreePath)) {
            const learnTree         = await fs.readJson(learnTreePath);
            const learnBasePath     = path.resolve(process.cwd(), 'learn');
            const filteredLearnData = learnTree.data.filter(item => item.id !== 'comparisons' && item.parentId !== 'comparisons');
            for (const item of filteredLearnData) {
                if (item.id && item.isLeaf !== false) {
                    const filePath = path.join(learnBasePath, `${item.id}.md`);
                    if (await fs.pathExists(filePath)) {
                        const content  = await fs.readFile(filePath, 'utf-8');
                        const sections = content.split(sectionsRegex);
                        const type     = item.parentId === 'Blog' ? 'blog' : 'guide';
                        if (sections.length > 1) {
                            sections.forEach(section => {
                                if (section.trim() === '') return;
                                const headingMatch = section.match(/^#+\s(.*)/);
                                const chunk = { type, kind: 'guide', name: `${item.name} - ${headingMatch ? headingMatch[1] : item.name}`, id: item.id, content: section, source: filePath };
                                chunk.hash = this.createContentHash(chunk);
                                writeStream.write(JSON.stringify(chunk) + '\n');
                                totalChunks++;
                            });
                        } else {
                            const chunk = { type, kind: 'guide', name: item.name, id: item.id, content, source: filePath };
                            chunk.hash = this.createContentHash(chunk);
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
                    const content  = await fs.readFile(filePath, 'utf-8');
                    const chunk    = { type: 'release', kind: 'release', name: file.replace('.md', ''), content, source: filePath };
                    chunk.hash = this.createContentHash(chunk);
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
                            const filePath   = path.join(versionPath, file);
                            const content    = await fs.readFile(filePath, 'utf-8');
                            const titleMatch = content.match(/^# Ticket: (.*)/m);
                            const chunk      = { type: 'ticket', kind: 'ticket', name: titleMatch ? titleMatch[1] : file.replace('.md', ''), content, source: filePath };
                            chunk.hash = this.createContentHash(chunk);
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
     * ### Key Functions:
     * 1.  **Scoring & Enrichment:** It loads the entire knowledge base into memory to perform holistic analysis,
     *     pre-calculating the full `inheritanceChain` for every chunk.
     * 2.  **Embedding & Storage:** It sends chunk content to the Google Generative AI API for vector embeddings
     *     and "upserts" the content, vector, and all metadata into the ChromaDB vector database.
     *
     * @returns {Promise<object>} A promise that resolves to a success message with the final document count.
     */
    async embedKnowledgeBase() {
        logger.log('Starting knowledge base embedding...');
        const knowledgeBasePath = aiConfig.dataPath;
        if (!await fs.pathExists(knowledgeBasePath)) {
            throw new Error(`Knowledge base file not found at ${knowledgeBasePath}. Please run createKnowledgeBase first.`);
        }

        const knowledgeBase = [];
        const fileStream    = fs.createReadStream(knowledgeBasePath);
        const rl            = readline.createInterface({input: fileStream, crlfDelay: Infinity});

        for await (const line of rl) {
            knowledgeBase.push(JSON.parse(line));
        }
        logger.log(`Loaded ${knowledgeBase.length} knowledge chunks from file.`);

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

        const collection = await ChromaManager.getKnowledgeBaseCollection();
        logger.log(`Using collection: ${collection.name}`);

        logger.log('Fetching existing documents from ChromaDB...');
        const existingDocs    = await collection.get({ include: ["metadatas"] });
        const existingDocsMap = new Map();

        existingDocs.ids.forEach((id, index) => {
            existingDocsMap.set(id, existingDocs.metadatas[index].hash);
        });
        logger.log(`Found ${existingDocsMap.size} existing documents.`);

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

        logger.log(`${chunksToProcess.length} chunks to add or update.`);
        logger.log(`${idsToDelete.length} chunks to delete.`);

        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        if (chunksToProcess.length === 0) {
            const message = 'No changes detected. Knowledge base is up to date.';
            logger.log(message);
            return { message };
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: aiConfig.embeddingModel });
        logger.log(`Initialized Google AI embedding model: ${aiConfig.embeddingModel}.`);

        logger.log('Embedding chunks...');
        const {batchSize, maxRetries} = aiConfig;

        for (let i = 0; i < chunksToProcess.length; i += batchSize) {
            const batch = chunksToProcess.slice(i, i + batchSize);
            const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);

            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    const result = await model.batchEmbedContents({
                        requests: textsToEmbed.map(text => ({ model: aiConfig.embeddingModel, content: { parts: [{ text }] } }))
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
                        ids      : batch.map(chunk => chunk.id),
                        embeddings,
                        metadatas
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

        const count   = await collection.count();
        const message = `Embedding complete. Collection now contains ${count} items.`;
        logger.log(message);
        return { message };
    }

    /**
     * A convenience orchestrator that runs the entire knowledge base synchronization process.
     * It first creates the knowledge base file and then embeds its contents into the vector database.
     * This provides a simple, single-command way to update the knowledge base from scratch.
     * @returns {Promise<object>} A promise that resolves to the final success message from the embedding step.
     */
    async syncDatabase() {
        logger.log('Starting full database synchronization...');
        await this.createKnowledgeBase();
        return await this.embedKnowledgeBase();
    }

    /**
     * Permanently deletes the entire knowledge base collection from ChromaDB.
     * This is a destructive but necessary operation for performing a clean reset of the knowledge base.
     * It handles cases where the collection may not exist gracefully.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteDatabase() {
        const collectionName = aiConfig.collectionName;
        try {
            await ChromaManager.client.deleteCollection({ name: collectionName });
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
}

export default Neo.setupClass(DatabaseService);
