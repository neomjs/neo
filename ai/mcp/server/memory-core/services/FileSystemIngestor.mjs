import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../../../../src/core/Base.mjs';
import crypto           from 'crypto';
import GraphService    from './GraphService.mjs';
import logger          from '../logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../../');

/**
 * @summary Ingests the physical Neo project structure into Native Graph nodes.
 *
 * Scans the filesystem dynamically before REM sleep to guarantee the memory-core
 * never hallucinates against stale Codebase structures. Maps files as 'FILE' nodes
 * and folders as 'DIRECTORY', establishing hierarchical 'CONTAINS' edges natively.
 *
 * @class Neo.ai.mcp.server.memory-core.services.FileSystemIngestor
 * @extends Neo.core.Base
 * @singleton
 */
class FileSystemIngestor extends Base {
    static config = {
        className: 'Neo.ai.mcp.server.memory-core.services.FileSystemIngestor',
        singleton: true,
        /**
         * Standard high-noise directories and files to completely ignore.
         */
        ignorePatterns_: ['node_modules', 'dist', '.git', '.DS_Store', 'build', '.env', '.neo-ai-data', 'docs/output', 'tmp', '.idea', '.gemini', '.agent', 'resources/images', 'resources/fonts'],
        /**
         * Extensions to explicitly ignore (images, fonts, raw binaries)
         */
        ignoreExts_: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.map', '.pdf', '.zip', '.tar', '.gz']
    }

    /**
     * Executes the recursive file system sync into the native Graph database.
     */
    async syncWorkspaceToGraph() {
        logger.info('[FileSystemIngestor] Initiating dynamic filesystem-to-graph sync...');

        if (!GraphService.db || !GraphService.db.nodes) {
            logger.warn('[FileSystemIngestor] GraphService DB not mounted. Aborting sync.');
            return;
        }

        // Precache existing mtimeMs dynamically bypassing RAM bloat cleanly natively
        const mtimeMap = new Map();
        const hashMap  = new Map();
        if (GraphService.db.storage?.db) {
            try {
                const stmt = GraphService.db.storage.db.prepare("SELECT id, data FROM Nodes WHERE id LIKE 'file-%'");
                const rows = stmt.all();
                for (const row of rows) {
                    const parsedData = JSON.parse(row.data);
                    if (parsedData?.properties?.mtimeMs) {
                        mtimeMap.set(row.id, parsedData.properties.mtimeMs);
                    }
                    if (parsedData?.properties?.hash) {
                        hashMap.set(row.id, parsedData.properties.hash);
                    }
                }
            } catch (e) {
                logger.debug(`[FileSystemIngestor] Caching skipped: ${e.message}`);
            }
        }

        const stats = { nodes: 0, edges: 0 };
        await this.walkDirectory(neoRootDir, neoRootDir, null, stats, mtimeMap, hashMap);
        
        logger.info(`[FileSystemIngestor] Workspace Sync Complete. Upserted/Verified ${stats.nodes} Nodes and ${stats.edges} new CONTAINS Edges.`);
    }

    /**
     * Recursive folder iteration mapping directly to GraphService endpoints.
     * @param {String} dir Current directory path
     * @param {String} rootDir The base root path determining relative node ids natively
     * @param {String|null} parentId Graph ID of the parent directory Node
     * @param {Object} stats Reference counter
     * @param {Map} mtimeMap Precaching SQLite map
     * @param {Map} hashMap Precaching SQLite hash map
     */
    async walkDirectory(dir, rootDir, parentId, stats, mtimeMap, hashMap) {
        let files;
        try {
            files = await fs.promises.readdir(dir);
        } catch(e) { return; }

        for (const file of files) {
            const fullPath = path.join(dir, file);
            let isDir = false;
            let stat;
            
            try {
                stat = await fs.promises.stat(fullPath);
                isDir = stat.isDirectory();
            } catch(e) { continue; } // symlink drops
            
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

            // 1. Structural check for explicit matches or directory hierarchies (e.g., docs/output/*)
            if (this.ignorePatterns.some(pattern => relativePath === pattern || relativePath.startsWith(pattern + '/'))) {
                continue;
            }

            // 2. Binary extension check for physical files
            if (!isDir) {
                const ext = path.extname(file).toLowerCase();
                if (this.ignoreExts.includes(ext)) {
                    continue;
                }
            }

            const nodeId = `file-${relativePath}`;
            const mtimeMs = stat.mtimeMs;

            const mtimeMatch = mtimeMap.get(nodeId) === mtimeMs;
            let fileHash = null;
            let isUnchanged = mtimeMatch;

            // Only hash if mtime mismatch on actual files
            if (!mtimeMatch && !isDir) {
                try {
                    const content = await fs.promises.readFile(fullPath);
                    fileHash = crypto.createHash('md5').update(content).digest('hex');
                    if (hashMap.get(nodeId) === fileHash) {
                        isUnchanged = true;
                    }
                } catch(e) {}
            }

            if (!isUnchanged) {
                // Upsert node bypassing textual embeddings (these are purely structural references)
                GraphService.upsertNode({
                    id: nodeId,
                    type: isDir ? 'DIRECTORY' : 'FILE',
                    name: file,
                    description: isDir ? `Directory: ${relativePath}` : `File path: ${relativePath}`,
                    properties: {
                        path: relativePath,
                        mtimeMs: mtimeMs,
                        ...(fileHash && { hash: fileHash })
                    }
                });
                stats.nodes++;

                // Create hierarchical structural edge
                if (parentId) {
                    let existingEdge = GraphService.db.edges.items.find(e => e.source === parentId && e.target === nodeId && e.type === 'CONTAINS');
                    if (!existingEdge) {
                        GraphService.db.addEdge({
                            id: globalThis.crypto.randomUUID(),
                            source: parentId,
                            target: nodeId,
                            type: 'CONTAINS',
                            properties: { weight: 1.0 }
                        });
                        stats.edges++;
                    }
                }
            }

            if (isDir) {
                await this.walkDirectory(fullPath, rootDir, nodeId, stats, mtimeMap, hashMap);
            }
        }
    }
}

export default Neo.setupClass(FileSystemIngestor);
