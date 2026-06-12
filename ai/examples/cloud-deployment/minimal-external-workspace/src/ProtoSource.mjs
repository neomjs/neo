import {existsSync}        from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import path                from 'node:path';
import Base                from 'neo.mjs/ai/services/knowledge-base/source/Base.mjs';
import aiConfig            from 'neo.mjs/ai/mcp/server/knowledge-base/config.mjs';

/**
 * @summary Example custom Source — indexes a tenant's `.proto` schema files in the full-corpus build.
 *
 * Demonstrates the Source contract: `extract(writeStream, createHashFn)`
 * writes one JSONL chunk record per file and returns the count. Registered via
 * `aiConfig.customSources` or `SourceRegistry.registerSource`; the territory path is read
 * from `aiConfig.sourcePaths.ProtoSource`. See learn/agentos/cloud-deployment/CustomSources.md.
 *
 * @class Example.kb.ProtoSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class ProtoSource extends Base {
    static config = {
        /**
         * @member {String} className='Example.kb.ProtoSource'
         * @protected
         */
        className: 'Example.kb.ProtoSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Extracts knowledge chunks from the workspace's `.proto` files.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Content-hash function — folds `tenantId` + `repoSlug` in automatically.
     * @returns {Promise<Number>} The number of chunks written.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        // `sourcePaths.ProtoSource` defaults to `proto` and can be overridden per deployment.
        const dir = path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths.ProtoSource);

        if (existsSync(dir)) {
            for (const file of (await readdir(dir)).sort()) {
                if (!file.endsWith('.proto')) continue;

                const filePath = path.join(dir, file);
                const chunk    = {
                    type   : 'proto',
                    kind   : 'schema',
                    name   : path.basename(file, '.proto'),
                    content: (await readFile(filePath, 'utf-8')).trim(),
                    source : path.join('proto', file)
                };

                chunk.hash = createHashFn(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                count++;
            }
        }

        return count;
    }
}

export default Neo.setupClass(ProtoSource);
