import Base                from '../../../../../src/core/Base.mjs';
import aiConfig            from '../config.mjs';

/**
 * @class Neo.ai.mcp.server.memory-core.managers.CollectionProxy
 * @extends Neo.core.Base
 */
class CollectionProxy extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.managers.CollectionProxy'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.managers.CollectionProxy',
        /**
         * @member {String} collectionType='memory'
         */
        collectionType: 'memory'
    }

    async getManagers() {
        const engine = aiConfig.engine || 'both';
        const managers = [];
        
        // In Hybrid RAG, vectors exclusively live in ChromaDB
        if (engine === 'chroma' || engine === 'hybrid' || engine === 'both' || engine === 'neo') {
            const { default: ChromaManager } = await import('./ChromaManager.mjs');
            await ChromaManager.ready();
            managers.push(ChromaManager);
        }
        
        return managers;
    }

    async getCollections() {
        const managers = await this.getManagers();
        return Promise.all(managers.map(m => {
            if (this.collectionType === 'graph') return m.getGraphCollection();
            return this.collectionType === 'memory' ? m.getMemoryCollection() : m.getSummaryCollection();
        }));
    }

    async add(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.add(args)));
    }

    async upsert(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.upsert(args)));
    }

    async update(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.update(args)));
    }

    async get(args) {
        const collections = await this.getCollections();
        return collections[0].get(args);
    }
    
    async query(args) {
        const collections = await this.getCollections();
        return collections[0].query(args);
    }
    
    async count() {
        const collections = await this.getCollections();
        return collections[0].count();
    }
    
    async delete(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.delete(args)));
    }

    async drop() {
        const managers = await this.getManagers();
        for (const manager of managers) {
            let coll;
            if (this.collectionType === 'graph') {
                coll = await manager.getGraphCollection();
            } else {
                coll = this.collectionType === 'memory' ? 
                    await manager.getMemoryCollection() : 
                    await manager.getSummaryCollection();
            }
                
            if (manager.client && manager.client.deleteCollection) {
                await manager.client.deleteCollection({ name: coll.name });
            } else if (manager.deleteCollection) {
                await manager.deleteCollection(coll.name);
            }
        }
    }
}

export default Neo.setupClass(CollectionProxy);
