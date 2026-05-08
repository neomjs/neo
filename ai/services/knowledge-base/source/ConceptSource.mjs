import Base from './Base.mjs';
import fs   from 'fs-extra';
import path from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from Concept Ontology nodes.
 *
 * This source provider reads `.neo-ai-data/concepts/nodes.jsonl`.
 * Each concept node is treated as a single knowledge chunk.
 *
 * @class Neo.ai.services.knowledge-base.source.ConceptSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class ConceptSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.ConceptSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.ConceptSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from concept nodes.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const nodesPath = path.resolve(aiConfig.neoRootDir, '.neo-ai-data/concepts/nodes.jsonl');

        if (await fs.pathExists(nodesPath)) {
            const content = await fs.readFile(nodesPath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                const node = JSON.parse(line);
                const chunk = {
                    type       : 'concept',
                    kind       : 'concept',
                    name       : node.name,
                    tier       : node.tier,
                    description: node.description,
                    content    : `${node.name}: ${node.description}`,
                    source     : path.relative(aiConfig.neoRootDir, nodesPath)
                };

                chunk.hash = createHashFn(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                count++;
            }
        }

        return count;
    }
}

export default Neo.setupClass(ConceptSource);
