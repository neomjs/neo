import Base                from '../../../../../src/core/Base.mjs';
import aiConfig            from '../config.mjs';
import ChromaManager       from './ChromaManager.mjs';
import SQLiteVectorManager from './SQLiteVectorManager.mjs';

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
        
        if (engine === 'chroma' || engine === 'both') {
            await ChromaManager.ready();
            managers.push(ChromaManager);
        }
        
        if (engine === 'neo' || engine === 'both') {
            await SQLiteVectorManager.ready();
            managers.push(SQLiteVectorManager);
        }
        
        return managers;
    }

    async getCollections() {
        const managers = await this.getManagers();
        return Promise.all(managers.map(m => 
            this.collectionType === 'memory' ? m.getMemoryCollection() : m.getSummaryCollection()
        ));
    }

    async add(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.add(args)));
    }

    async upsert(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.upsert(args)));
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
            const coll = this.collectionType === 'memory' ? 
                await manager.getMemoryCollection() : 
                await manager.getSummaryCollection();
                
            if (manager.client && manager.client.deleteCollection) {
                await manager.client.deleteCollection({ name: coll.name });
            } else if (manager.deleteCollection) {
                await manager.deleteCollection(coll.name);
            }
        }
    }
}

export default Neo.setupClass(CollectionProxy);
