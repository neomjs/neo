import Base from '../../../../../src/core/Base.mjs';
import path from 'path';

/**
 * @summary Extracts knowledge chunks from JSDoc API data.
 *
 * This parser transforms the structured JSON output from JSDoc (`docs/output/all.json`)
 * into flattened knowledge chunks. It handles the three primary API entities:
 * 1.  **Classes:** Extracts descriptions and inheritance relationships.
 * 2.  **Configs:** Extracts member descriptions, types, and default values.
 * 3.  **Methods:** Extracts signatures, parameters, return types, and descriptions.
 *
 * It also classifies content as 'example' or 'src' based on the file path, helping
 * to distinguish between library code and demo usage.
 *
 * @class Neo.ai.mcp.server.knowledge-base.parser.ApiParser
 * @extends Neo.core.Base
 * @singleton
 */
class ApiParser extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.parser.ApiParser'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.parser.ApiParser',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Parses the JSDoc API data array into granular chunks.
     * @param {Array<Object>} apiData The JSDoc output array.
     * @returns {Array<Object>} An array of chunks.
     */
    parse(apiData) {
        const chunks = [];

        apiData.forEach(item => {
            const sourceFile = item.meta ? path.join(item.meta.path, item.meta.filename) : 'unknown';
            let chunk, type  = sourceFile.includes('/examples/') ? 'example' : 'src';

            if (item.kind === 'class') {
                chunk = {
                    type,
                    kind       : 'class',
                    name       : item.longname,
                    description: item.comment,
                    extends    : item.augments?.[0],
                    source     : sourceFile
                };
            } else if (item.kind === 'member' && item.memberof) {
                chunk = {
                    type,
                    kind       : 'config',
                    className  : item.memberof,
                    name       : item.name,
                    description: item.description,
                    configType : item.type?.names.join('|') || 'unknown',
                    source     : sourceFile
                };
            } else if (item.kind === 'function' && item.memberof) {
                chunk = {
                    type,
                    kind       : 'method',
                    className  : item.memberof,
                    name       : item.name,
                    description: item.description,
                    params     : item.params?.map(p => ({name: p.name, type: p.type?.names.join('|')})),
                    returns    : item.returns?.map(r => r.type?.names.join('|')).join('|'),
                    source     : sourceFile
                };
            }

            if (chunk) {
                chunks.push(chunk);
            }
        });

        return chunks;
    }
}

export default Neo.setupClass(ApiParser);
