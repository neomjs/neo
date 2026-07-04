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
        const architecture = aiConfig.engine;
        const managers     = [];

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
            if (this.collectionType === 'graph')           return m.getGraphCollection();
            if (this.collectionType === 'temporalSummary') return m.getTemporalSummaryCollection();
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
            } else if (this.collectionType === 'temporalSummary') {
                coll = await manager.getTemporalSummaryCollection();
            } else {
                coll = this.collectionType === 'memory' ?
                    await manager.getMemoryCollection() :
                    await manager.getSummaryCollection();
            }

            const chromaCoordinates = aiConfig.engines.chroma;
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

            // Route through the guarded `manager.deleteCollection({name, confirmation})`
            // wrapper. The path-target guard above already passed; the operator confirmation token
            // is threaded down so the uniform collection-name gate accepts the production-recovery
            // bypass. Fail closed if a manager lacks the wrapper because bare-client fallback would
            // bypass the destructive-operation guard.
            if (typeof manager.deleteCollection !== 'function') {
                throw new Error(
                    `[CollectionProxy] manager ${manager?.constructor?.config?.className || 'unknown'} ` +
                    `lacks the guarded deleteCollection wrapper; refusing bare client.deleteCollection ` +
                    `fallback per #11652 substrate-level invariant.`
                );
            }
            await manager.deleteCollection({name: coll.name, confirmation});
        }
    }
}

export default Neo.setupClass(CollectionProxy);
