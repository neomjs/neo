import {ChromaClient} from 'chromadb';
import {Command}      from 'commander/esm.mjs';
import aiConfig       from './aiConfig.mjs';
import fs             from 'fs-extra';
import readline       from 'readline';

const program = new Command();

program
    .name('neo-ai-import-memory')
    .version('1.0.0')
    .requiredOption('-f, --file <value>', 'The path to the memory backup file (.jsonl)')
    .parse(process.argv);

const opts = program.opts();

/**
 * @summary Imports AI agent memories from a JSONL backup file into ChromaDB.
 *
 * This script provides the restore functionality for the agent's memory. It reads a
 * previously exported backup file and upserts the records into the agent's memory
 * collection. This allows for migrating memory to a new database or recovering from
 * data loss.
 *
 * @see {@link .github/ISSUE/ticket-implement-memory-backup-and-restore.md}
 */
class ImportMemory {
    static async run(filePath) {
        console.log(`Starting agent memory import from: ${filePath}`);

        if (!await fs.pathExists(filePath)) {
            console.error(`Error: Backup file not found at ${filePath}`);
            return;
        }

        // 1. Initialize client and connect to collection
        const {host, port, collectionName} = aiConfig.memory;
        const dbClient = new ChromaClient({ host, port, ssl: false });

        let collection;
        try {
            collection = await dbClient.getOrCreateCollection({ name: collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        } catch (err) {
            console.error(`Could not connect to collection "${collectionName}". Please ensure the memory server is running (\`npm run ai:server-memory\`).`);
            return;
        }

        // 2. Read the backup file
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        const records = [];
        for await (const line of rl) {
            records.push(JSON.parse(line));
        }

        if (records.length === 0) {
            console.log('No records found in backup file to import.');
            return;
        }

        // 3. Upsert data into the collection
        console.log(`Importing ${records.length} memories...`);

        // ChromaDB expects separate arrays for each property
        await collection.upsert({
            ids: records.map(r => r.id),
            embeddings: records.map(r => r.embedding),
            metadatas: records.map(r => r.metadata),
            documents: records.map(r => r.document)
        });

        const count = await collection.count();
        console.log(`Import complete. Collection "${collectionName}" now contains ${count} memories.`);
    }
}

ImportMemory.run(opts.file).catch(err => {
    console.error('Error importing memory:', err);
    process.exit(1);
});
