import Base from '../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter } from '../../services.mjs';
import { Memory_GraphService as GraphService } from '../../services.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';

/**
 * @class Neo.ai.daemons.services.GraphMaintenanceService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphMaintenanceService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.GraphMaintenanceService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.GraphMaintenanceService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Executes the global "Fade" algorithm across all Native Graph edges,
     * then executes Vector Apoptosis to clean up resulting orphaned nodes from the hybrid semantic space.
     */
    async runGarbageCollection() {
        logger.info('[GraphMaintenanceService] Initiating Graph Garbage Collection (Apoptosis)...');

        const edges = GraphService.db.edges.items.slice();
        let cullCount = 0;

        edges.forEach(e => {
            if (e.type === 'SYSTEM_TENET') return; // Protect structural system edges from fading

            // Enforce SQLite Foreign Key constraints dynamically to avoid crashes
            if (!GraphService.db.nodes.get(e.source) || !GraphService.db.nodes.get(e.target)) {
                GraphService.db.removeEdge(e.id);
                cullCount++;
            }
        });

        logger.info(`[GraphMaintenanceService] Garbage Collection complete. Severed ${cullCount} unanchored edges.`);

        // Vector Apoptosis: Identify orphans and purge from Hybrid Store
        logger.info('[GraphMaintenanceService] Initializing Vector Apoptosis (Orphaned Node Cleanup)...');
        const orphaned = GraphService.getOrphanedNodes();

        if (orphaned.length > 0) {
            logger.info(`[GraphMaintenanceService] Apoptosis detected ${orphaned.length} orphaned nodes. Commencing eradication...`);
            GraphService.removeNodes(orphaned);

            try {
                // Cross-layer purge from semantic embeddings
                logger.info(`[GraphMaintenanceService] Purging semantic vectors for ${orphaned.length} deleted nodes.`);

                const graphColl = await StorageRouter.getGraphCollection();
                const summaryColl = await StorageRouter.getSummaryCollection();

                if (graphColl) {
                    await graphColl.delete({ ids: orphaned }).catch(() => {});
                }
                if (summaryColl) {
                    await summaryColl.delete({ ids: orphaned }).catch(() => {});
                }
            } catch (e) {
                logger.warn(`[GraphMaintenanceService] Apoptosis soft-failure on Vector purge: ${e.message}`);
            }
        }
    }
}

export default Neo.setupClass(GraphMaintenanceService);
