import Base from 'neo.mjs/src/core/Base.mjs';

/**
 * @summary Example custom Parser — splits Protobuf schema files into parsed-chunk-v1 records.
 *
 * Demonstrates the cloud-ingestion parser contract for Epic #11624: a server-side parser
 * implements `parseIngestionFile(file, {tenantContext})` and returns `parsed-chunk-v1`
 * records directly. Registered by `parserId` (`'proto'`) via `aiConfig.customParsers` or
 * `SourceRegistry.registerParser`. See learn/agentos/cloud-deployment/CustomParsers.md.
 *
 * @class Example.kb.ProtoParser
 * @extends Neo.core.Base
 * @singleton
 */
class ProtoParser extends Base {
    static config = {
        /**
         * @member {String} className='Example.kb.ProtoParser'
         * @protected
         */
        className: 'Example.kb.ProtoParser',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Parses a `.proto` file into one parsed-chunk-v1 record per top-level message/service/enum.
     * @param {Object} file The ingestion file entry — `{sourcePath, content, rootKind?, repoSlug?}`.
     * @param {Object} options
     * @param {Object} options.tenantContext Resolved tenant context (`{tenantId, repoSlug, ...}`).
     * @returns {Array<Object>} parsed-chunk-v1 records (`embedding` is never set — embeddings are server-side).
     */
    parseIngestionFile(file, {tenantContext}) {
        const {sourcePath, content = ''} = file;
        const blockRegex                 = /^(message|service|enum)\s+(\w+)\s*\{[\s\S]*?^\}/gm;
        const chunks                     = [];
        let   match;

        while ((match = blockRegex.exec(content)) !== null) {
            const [block, blockKind, blockName] = match;

            chunks.push({
                schemaVersion: '1.0.0',
                tenantId     : tenantContext.tenantId,
                repoSlug     : file.repoSlug || tenantContext.repoSlug,
                rootKind     : file.rootKind || 'bare-repo',
                sourcePath,
                content      : block,
                hashInputs   : ['kind', 'name', 'content', 'sourcePath'],
                parserId     : 'proto',
                parserVersion: '1.0.0',
                kind         : `proto-${blockKind}`,
                name         : `${sourcePath} - ${blockName}`
            });
        }

        return chunks;
    }
}

export default Neo.setupClass(ProtoParser);
