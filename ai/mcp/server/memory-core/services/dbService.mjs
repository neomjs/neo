import chromaManager from './chromaManager.mjs';
import aiConfig      from '../../config.mjs';
import fs            from 'fs-extra';
import path          from 'path';
import readline      from 'readline';

async function exportCollection(collection, backupPath, filePrefix) {
    console.log(`Fetching all documents from "${collection.name}"...`);
    const data = await collection.get({ include: ["documents", "embeddings", "metadatas"] });
    const count = data.ids.length;

    if (count === 0) {
        console.log(`No documents found in ${collection.name} to export.`);
        return 0;
    }

    console.log(`Found ${count} documents in ${collection.name} to export.`);

    await fs.ensureDir(backupPath);
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupFile = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
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
    console.log(`Successfully exported ${count} documents to: ${backupFile}`);
    return count;
}

export async function exportDatabase({ include }) {
    console.log('Starting agent memory export...');
    let memoryCount = 0, summaryCount = 0;

    if (include.includes('memories')) {
        const collection = await chromaManager.getMemoryCollection();
        memoryCount = await exportCollection(collection, aiConfig.memory.backupPath, 'memory-backup');
    }

    if (include.includes('summaries')) {
        const collection = await chromaManager.getSummaryCollection();
        summaryCount = await exportCollection(collection, aiConfig.sessions.backupPath, 'summaries-backup');
    }

    return { message: `Export complete. Exported ${memoryCount} memories and ${summaryCount} summaries.` };
}

export async function importDatabase({ file, mode }) {
    const filePath = file; // Assuming file object contains path
    console.log(`Starting agent memory import from: ${filePath}`);

    if (!await fs.pathExists(filePath)) {
        throw new Error(`Backup file not found at ${filePath}`);
    }

    // Determine which collection to import into based on filename
    const isMemoryBackup = path.basename(filePath).startsWith('memory-backup');
    const collection = isMemoryBackup 
        ? await chromaManager.getMemoryCollection() 
        : await chromaManager.getSummaryCollection();

    if (mode === 'replace') {
        await chromaManager.client.deleteCollection({ name: collection.name });
        const newCollection = isMemoryBackup 
            ? await chromaManager.getMemoryCollection() 
            : await chromaManager.getSummaryCollection();
        console.log('Replaced mode: existing collection cleared and recreated.');
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

    console.log(`Importing ${records.length} documents into ${collection.name}...`);

    await collection.upsert({
        ids: records.map(r => r.id),
        embeddings: records.map(r => r.embedding),
        metadatas: records.map(r => r.metadata),
        documents: records.map(r => r.document)
    });

    const count = await collection.count();
    console.log(`Import complete. Collection "${collection.name}" now contains ${count} documents.`);
    return { imported: records.length, total: count, mode };
}