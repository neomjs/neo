import aiConfig                          from './config.mjs';
import IngestionService                  from '../../../services/knowledge-base/IngestionService.mjs';
import {isRemoteKnowledgeBaseDeployment} from '../../../services/knowledge-base/helpers/deploymentMode.mjs';

const ingestToolName = 'ingest_source_files';

/**
 * @summary Normalizes optional MCP server prefixes before transport-gating tool names.
 * @param {String} toolName The requested MCP tool name.
 * @returns {String} The effective OpenAPI operation id.
 */
const getEffectiveToolName = toolName => {
    const lastDoubleUnderscoreIndex = toolName.lastIndexOf('__');

    return lastDoubleUnderscoreIndex !== -1
        ? toolName.substring(lastDoubleUnderscoreIndex + 2)
        : toolName;
};

/**
 * @summary Returns true when the KB MCP server is in its remote tenant-ingestion deployment profile.
 * @returns {Boolean} True when remote tenant push clients may call `ingest_source_files`.
 */
const isRemoteIngestDeployment = () => isRemoteKnowledgeBaseDeployment(aiConfig);

/**
 * @summary Returns true when the ingest tool should appear in MCP tools/list.
 * @returns {Boolean} True when the current transport exposes `ingest_source_files`.
 */
const isIngestSourceFilesToolVisible = () => isRemoteIngestDeployment();

/**
 * @summary Fails closed when a local stdio client tries to invoke the remote push facade.
 * @param {String} toolName The requested MCP tool name.
 */
const assertToolTransportAllowed = toolName => {
    if (getEffectiveToolName(toolName) === ingestToolName && !isRemoteIngestDeployment()) {
        throw new Error(
            '`ingest_source_files` is only exposed when the Knowledge Base MCP server runs ' +
            'with `transport: "streamable-http"`. Use `npm run ai:ingest-tenant` or ' +
            'direct service ingestion for local stdio workflows.'
        );
    }
};

/**
 * @summary MCP facade for `IngestionService.ingestSourceFiles`.
 *
 * An agent-initiated `ingest_source_files` push embeds synchronously; an oversized batch
 * would freeze the calling agent. This facade counts the batch volume up-front and, when
 * it exceeds `aiConfig.mcpSyncMaxChunks` (default 50), refuses with a structured
 * `KB_INGEST_VOLUME_EXCEEDED` payload instead of dispatching to the service.
 *
 * Batch volume = the summed `parsedChunks` length across `files`, counting each raw
 * (un-parsed) file as 1. Raw files are chunked server-side, so a small batch of large
 * raw files can still exceed the threshold post-parse; the gate is a coarse up-front
 * guard, not an exact post-parse count.
 *
 * The gate lives at the MCP facade (not threaded into the service) because the batch
 * volume is knowable from the input alone, keeping service-layer ingestion logic
 * unchanged and transport policy localized to the MCP facade. This boundary also
 * strips the pull orchestrator's internal materialization-attempt field, forces MCP
 * work-volume mode, and never returns a durable pull receipt to a push caller.
 *
 * @param {Object}    args            The `ingest_source_files` tool envelope.
 * @param {String}   [args.tenantId]  Authenticated tenant id.
 * @param {Object[]} [args.files]     Raw file payloads or client-side parsed records.
 * @returns {Promise<Object>} The `IngestionService.ingestSourceFiles` summary,
 *     OR a `{error, message, code: 'KB_INGEST_VOLUME_EXCEEDED', bulkPath, batchSize, threshold}`
 *     refusal when the work-volume gate fires.
 * @see https://github.com/neomjs/neo/issues/11634
 * @see https://github.com/neomjs/neo/issues/10572
 * @see https://github.com/neomjs/neo/issues/16045
 */
const ingestSourceFilesViaMcp = async args => {
    const
        files     = Array.isArray(args?.files) ? args.files : [],
        batchSize = files.reduce((sum, file) => sum + (Array.isArray(file?.parsedChunks) ? file.parsedChunks.length : 1), 0),
        threshold = aiConfig.mcpSyncMaxChunks;

    if (batchSize > threshold) {
        return {
            error  : 'KB ingest work volume exceeds MCP-callable threshold',
            message: `Batch volume ${batchSize} exceeds the MCP-synchronous threshold ${threshold}. ` +
                       `Re-invoke ingest_source_files with at most ${threshold} files/chunks per call; ` +
                       `a tenant-scoped bulk ingestion facade is planned (Phase 2C).`,
            code    : 'KB_INGEST_VOLUME_EXCEEDED',
            bulkPath: null,
            batchSize,
            threshold
        };
    }

    const serviceArgs = {...(args || {}), viaMcp: true};

    delete serviceArgs.materializationAttempt;

    const result = await IngestionService.ingestSourceFiles(serviceArgs);

    if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'materializationReceipt')) {
        return result
    }

    const publicResult = {...result};

    delete publicResult.materializationReceipt;

    return publicResult
};

export {
    assertToolTransportAllowed,
    ingestSourceFilesViaMcp,
    ingestToolName,
    isIngestSourceFilesToolVisible
};
