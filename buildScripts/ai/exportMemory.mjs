import {ChromaClient} from 'chromadb';
import aiConfig       from './aiConfig.mjs';
import fs             from 'fs-extra';
import path           from 'path';

/**
 * @summary Exports the entire AI agent memory from ChromaDB to a JSONL backup file.
 *
 * This script connects to the agent's memory database, fetches all stored memories,
 * and writes them to a timestamped `.jsonl` file. This provides a crucial mechanism
 * for backing up the agent's history to prevent data loss.
 *
 * @see {@link .github/ISSUE/ticket-implement-memory-backup-and-restore.md}
 */
class ExportMemory {
    static async run() {
        console.log('Starting agent memory export...');

        // 1. Initialize client and connect to collection
        const {host, port, collectionName, backupPath} = aiConfig.memory;
        const dbClient = new ChromaClient({ host, port, ssl: false });

        let collection;
        try {
            collection = await dbClient.getCollection({ name: collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        } catch (err) {
            console.error(`Could not connect to collection \"${collectionName}\". Please ensure the memory server is running (\`npm run ai:server-memory\`).`);
            return;
        }

        // 2. Fetch all data from the collection
        console.log(`Fetching all documents from \"${collectionName}\"...`);
        const data = await collection.get({ include: ["documents", "embeddings", "metadatas"] });
        const count = data.ids.length;

        if (count === 0) {
            console.log('No memories found to export.');
            return;
        }

        console.log(`Found ${count} memories to export.`);

        // 3. Prepare backup file
        await fs.ensureDir(backupPath);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = path.join(backupPath, `memory-backup-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

        // 4. Write data to JSONL file
        for (let i = 0; i < count; i++) {
            const record = {
                id: data.ids[i],
                embedding: data.embeddings[i],
                metadata: data.metadatas[i],
                document: data.documents[i]
            };
            writeStream.write(JSON.stringify(record) + '\n');
        }

        writeStream.end();

        console.log(`Successfully exported ${count} memories to: ${backupFile}`);
    }
}

ExportMemory.run().catch(err => {
    console.error('Error exporting memory:', err);
    process.exit(1);
});
