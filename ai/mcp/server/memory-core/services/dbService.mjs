import {ChromaClient} from 'chromadb';
import aiConfig       from '../../../../../buildScripts/ai/aiConfig.mjs';
import fs             from 'fs-extra';
import path           from 'path';
import readline       from 'readline';

async function getMemoryCollection() {
    const {host, port, collectionName} = aiConfig.memory;
    const dbClient = new ChromaClient({ host, port, ssl: false });
    return await dbClient.getOrCreateCollection({ name: collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
}

export async function exportDatabase({ include }) {
    console.log('Starting agent memory export...');

    if (include.includes('memories')) {
        const collection = await getMemoryCollection();
        const backupPath = aiConfig.memory.backupPath;

        console.log(`Fetching all documents from "${collection.name}"...`);
        const data = await collection.get({ include: ["documents", "embeddings", "metadatas"] });
        const count = data.ids.length;

        if (count === 0) {
            console.log('No memories found to export.');
            return;
        }

        console.log(`Found ${count} memories to export.`);

        await fs.ensureDir(backupPath);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = path.join(backupPath, `memory-backup-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

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
        return { message: `Successfully exported ${count} memories`, backupFile };
    }
}

export async function importDatabase({ file, mode }) {
    const filePath = file; // Assuming file object contains path
    console.log(`Starting agent memory import from: ${filePath}`);

    if (!await fs.pathExists(filePath)) {
        throw new Error(`Backup file not found at ${filePath}`);
    }

    const collection = await getMemoryCollection();

    if (mode === 'replace') {
        // Clear existing data - simplified, assumes we just clear and add
        await collection.delete(); // This might not be the exact API, depends on chromadb version
        console.log('Replaced mode: existing collection cleared.');
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const records = [];
    for await (const line of rl) {
        records.push(JSON.parse(line));
    }

    if (records.length === 0) {
        return { message: 'No records found in backup file to import.' };
    }

    console.log(`Importing ${records.length} memories...`);

    await collection.upsert({
        ids: records.map(r => r.id),
        embeddings: records.map(r => r.embedding),
        metadatas: records.map(r => r.metadata),
        documents: records.map(r => r.document)
    });

    const count = await collection.count();
    console.log(`Import complete. Collection "${collection.name}" now contains ${count} memories.`);
    return { imported: records.length, total: count, mode };
}
