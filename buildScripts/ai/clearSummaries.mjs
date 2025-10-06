import {ChromaClient} from 'chromadb';
import aiConfig       from './aiConfig.mjs';

class ClearSummaries {
    static async run() {
        const {host, port, collectionName} = aiConfig.sessions;
        const dbClient = new ChromaClient({ host, port, ssl: false });

        console.log(`Attempting to delete collection: ${collectionName}...`);
        try {
            await dbClient.deleteCollection({ name: collectionName });
            console.log('Collection deleted successfully.');
        } catch (e) {
            console.log('Could not delete collection, it may not exist, which is okay.');
        }

        console.log(`Attempting to create collection: ${collectionName}...`);
        await dbClient.createCollection({ name: collectionName });
        console.log('Collection created successfully.');
    }
}

ClearSummaries.run().catch(err => {
    console.error('Error clearing summaries:', err);
    process.exit(1);
});
