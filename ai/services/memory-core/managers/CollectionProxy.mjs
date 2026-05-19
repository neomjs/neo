import Base                      from '../../../../src/core/Base.mjs';
import aiConfig                  from '../../../mcp/server/memory-core/config.mjs';
import DestructiveOperationGuard from '../../../mcp/server/shared/services/DestructiveOperationGuard.mjs';

/**
 * @class Neo.ai.services.memory-core.managers.CollectionProxy
 * @extends Neo.core.Base
 */
class CollectionProxy extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.managers.CollectionProxy'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.managers.CollectionProxy',
        /**
         * @member {String} collectionType='memory'
         */
        collectionType: 'memory'
    }

    async getManagers() {
        const architecture = aiConfig.engine || 'hybrid';
        const managers = [];

        // In Hybrid RAG, vectors exclusively live in ChromaDB
        if (architecture === 'chroma' || architecture === 'hybrid') {
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
        if (!collections || collections.length === 0 || !collections[0]) {
            throw new Error(`[CollectionProxy] get() failed: No underlying collection available for type '${this.collectionType}'`);
        }
        return collections[0].get(args);
    }

    async query(args) {
        const collections = await this.getCollections();
        if (!collections || collections.length === 0 || !collections[0]) {
            throw new Error(`[CollectionProxy] query() failed: No underlying collection available for type '${this.collectionType}'`);
        }
        return collections[0].query(args);
    }

    async count() {
        const collections = await this.getCollections();
        if (!collections || collections.length === 0 || !collections[0]) {
            throw new Error(`[CollectionProxy] count() failed: No underlying collection available for type '${this.collectionType}'`);
        }
        return collections[0].count();
    }

    async delete(args) {
        const collections = await this.getCollections();
        await Promise.all(collections.map(c => c.delete(args)));
    }

    async drop({confirmation} = {}) {
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

            const chromaCoordinates = aiConfig.engines?.chroma || {};
            const chromaPath        = chromaCoordinates.path || chromaCoordinates.dataDir;

            await DestructiveOperationGuard.assertDestructiveTargetAllowed({
                operation: `memory-core.${this.collectionType}.drop`,
                subsystem: 'memory-core',
                mode     : 'drop',
                target   : {
                    collectionName: coll.name,
                    chroma        : {
                        host: chromaCoordinates.host,
                        port: chromaCoordinates.port,
                        path: chromaPath
                    },
                    path    : chromaPath,
                    repoRoot: process.cwd()
                },
                confirmation
            });

            // Prefer the guarded ChromaManager.deleteCollection (#11652 substrate guard).
            // The path-target guard above already passed; forward the operator confirmation
            // so the collection-name-level guard accepts it for canonical names.
            if (manager.deleteCollection) {
                await manager.deleteCollection({name: coll.name, confirmation});
            } else if (manager.client?.deleteCollection) {
                await manager.client.deleteCollection({name: coll.name});
            }
        }
    }
}

export default Neo.setupClass(CollectionProxy);
