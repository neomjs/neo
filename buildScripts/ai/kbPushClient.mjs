// Neo namespace bootstrap (entry-point invariant) - tenant-side KB push client.
// Mirrors buildScripts/ai/ingestTenant.mjs so this CLI can use Neo's MCP client
// wrapper from a tenant checkout or CI job.
import Neo            from '../../src/Neo.mjs';
import * as core      from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';
import fs             from 'fs';
import {pathToFileURL} from 'url';
import Client         from '../../ai/mcp/client/Client.mjs';
import ClientConfig   from '../../ai/mcp/client/config.mjs';

/**
 * @module buildScripts/ai/kbPushClient
 *
 * @summary Tenant-side repo-push client for the KB `ingest_source_files` MCP facade.
 *
 * This is the operator-facing invocation primitive for #11743's MCP-over-StreamableHTTP
 * path. Tenant hooks or CI jobs build a content-bearing ingestion envelope, then this
 * client connects to the cloud KB MCP `/mcp` endpoint with an automation identity token
 * and calls `ingest_source_files`. Large backfills remain the co-located
 * `ai:ingest-tenant` bulk CLI; this client intentionally preserves the MCP work-volume
 * gate and fails visibly when the server returns `KB_INGEST_VOLUME_EXCEEDED`.
 *
 * Usage:
 * `npm run ai:kb-push-client -- --url https://kb.example.com/mcp --from-file envelope.json`
 *
 * Environment defaults:
 * - `NEO_KB_MCP_URL` - remote KB MCP endpoint URL.
 * - `NEO_KB_MCP_TRANSPORT` - `streamable-http` (default) or `sse`.
 * - `NEO_KB_INGEST_TOKEN` - bearer token for the repo-push automation identity.
 * - `NEO_KB_TENANT_ID` / `NEO_KB_REPO_SLUG` - optional envelope defaults.
 *
 * @see https://github.com/neomjs/neo/issues/11743
 */

const DEFAULT_TOKEN_ENV = 'NEO_KB_INGEST_TOKEN';

/**
 * @summary Parses the tenant push-client CLI argv.
 * @param {String[]} argv `process.argv.slice(2)`.
 * @param {Object} env Environment defaults; injected by tests.
 * @returns {Object}
 */
function parseArgs(argv, env = process.env) {
    const args = {
        allowUnauthenticated: false,
        clientName          : 'neo-kb-push-client',
        fromFile            : null,
        fromStdin           : false,
        repoSlug            : env.NEO_KB_REPO_SLUG || null,
        tenantId            : env.NEO_KB_TENANT_ID || null,
        token               : null,
        tokenEnv            : env.NEO_KB_TOKEN_ENV || DEFAULT_TOKEN_ENV,
        transport           : env.NEO_KB_MCP_TRANSPORT || 'streamable-http',
        url                 : env.NEO_KB_MCP_URL || null
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        switch (arg) {
        case '--allow-unauthenticated':
            args.allowUnauthenticated = true;
            break;
        case '--client-name':
            args.clientName = argv[++i];
            break;
        case '--from-file':
            args.fromFile = argv[++i];
            break;
        case '--from-stdin':
            args.fromStdin = true;
            break;
        case '--repo-slug':
            args.repoSlug = argv[++i];
            break;
        case '--tenant-id':
            args.tenantId = argv[++i];
            break;
        case '--token':
            args.token = argv[++i];
            break;
        case '--token-env':
            args.tokenEnv = argv[++i];
            break;
        case '--transport':
            args.transport = argv[++i];
            break;
        case '--url':
            args.url = argv[++i];
            break;
        }
    }

    if (!args.token && args.tokenEnv) {
        args.token = env[args.tokenEnv] || null;
    }

    return args;
}

/**
 * @summary Prints CLI usage to stderr.
 * @returns {void}
 */
function printUsage() {
    console.error('Usage: npm run ai:kb-push-client -- --url <https://kb.example.com/mcp> (--from-file envelope.json | --from-stdin) [--token-env NEO_KB_INGEST_TOKEN]');
}

/**
 * @summary Reads one JSON ingestion envelope from a stream.
 * @param {ReadableStream} input Stream containing one JSON object.
 * @returns {Promise<Object>}
 */
async function readJsonPayload(input) {
    let text = '';

    for await (const chunk of input) {
        text += chunk;
    }

    const trimmed = text.trim();

    if (!trimmed) {
        throw new Error('No JSON payload provided.');
    }

    return JSON.parse(trimmed);
}

/**
 * @summary Applies CLI/env defaults to an ingestion envelope without overriding explicit payload fields.
 * @param {Object} envelope Source envelope from hook/CI.
 * @param {Object} args Parsed CLI args.
 * @returns {Object}
 */
function applyEnvelopeDefaults(envelope, args) {
    const normalized = {...envelope};

    if (args.tenantId && normalized.tenantId === undefined) {
        normalized.tenantId = args.tenantId;
    }

    if (args.repoSlug && normalized.repoSlug === undefined) {
        normalized.repoSlug = args.repoSlug;
    }

    if (args.repoSlug && normalized.manifestSnapshot && normalized.manifestSnapshot.repoSlug === undefined) {
        normalized.manifestSnapshot = {
            ...normalized.manifestSnapshot,
            repoSlug: args.repoSlug
        };
    }

    return normalized;
}

/**
 * @summary Builds the transient MCP client config for the remote KB endpoint.
 * @param {Object} args Parsed CLI args.
 * @returns {Object}
 */
function buildServerConfig(args) {
    const headers = {};

    if (args.token) {
        headers.Authorization = `Bearer ${args.token}`;
    }

    return {
        transportType   : args.transport,
        url             : args.url,
        transportOptions: Object.keys(headers).length
            ? {requestInit: {headers}}
            : {}
    };
}

/**
 * @summary Decodes a standard MCP call result into the tool payload when possible.
 * @param {Object} result Raw SDK callTool result.
 * @returns {*}
 */
function decodeToolResult(result) {
    const firstText = result?.content?.find?.(entry => entry.type === 'text')?.text;

    if (!firstText) {
        return result;
    }

    try {
        return JSON.parse(firstText);
    } catch {
        return result;
    }
}

/**
 * @summary Detects whether an ingestion summary should make the hook/CI fail.
 * @param {*} payload Decoded tool payload.
 * @returns {Boolean}
 */
function hasIngestFailure(payload) {
    if (payload?.isError || payload?.code === 'KB_INGEST_VOLUME_EXCEEDED') {
        return true;
    }

    return Array.isArray(payload?.errors) && payload.errors.length > 0;
}

/**
 * @summary Calls `ingest_source_files` through a remote MCP client.
 * @param {Object} options
 * @param {Object} options.args Parsed CLI args.
 * @param {ReadableStream} options.input Source stream for the envelope.
 * @param {Function} [options.clientFactory] Test seam returning a connected-client-shaped object.
 * @param {Object} [options.clientConfig] Test seam for ClientConfig.
 * @returns {Promise<*>} Decoded tool payload.
 */
async function runPush({args, input, clientFactory, clientConfig = ClientConfig}) {
    const envelope = applyEnvelopeDefaults(await readJsonPayload(input), args),
          serverName = `knowledge-base-push-${Date.now()}`;

    clientConfig.data.mcpServers[serverName] = buildServerConfig(args);

    const client = clientFactory
        ? clientFactory({serverName, clientName: args.clientName})
        : Neo.create(Client, {serverName, clientName: args.clientName});

    try {
        await client.initAsync?.();
        return decodeToolResult(await client.callTool('ingest_source_files', envelope));
    } finally {
        await client.close?.();
        delete clientConfig.data.mcpServers[serverName];
    }
}

/**
 * @summary Validates parsed CLI args before network work begins.
 * @param {Object} args Parsed CLI args.
 * @returns {String[]} Human-readable validation errors.
 */
function validateArgs(args) {
    const errors = [];

    if (!args.url) {
        errors.push('Missing --url or NEO_KB_MCP_URL.');
    }

    if (!args.fromFile && !args.fromStdin) {
        errors.push('Provide --from-file or --from-stdin.');
    }

    if (args.fromFile && args.fromStdin) {
        errors.push('Use only one of --from-file or --from-stdin.');
    }

    if (args.fromFile && !fs.existsSync(args.fromFile)) {
        errors.push(`--from-file path does not exist: ${args.fromFile}`);
    }

    if (!['sse', 'streamable-http', 'streamableHttp'].includes(args.transport)) {
        errors.push(`Unsupported --transport '${args.transport}'. Expected streamable-http or sse.`);
    }

    if (!args.allowUnauthenticated && !args.token) {
        errors.push(`Missing bearer token: set --token, --token-env, or ${DEFAULT_TOKEN_ENV}. Use --allow-unauthenticated only for a local demo deployment.`);
    }

    return errors;
}

/**
 * @summary CLI entry point.
 * @returns {Promise<void>}
 */
async function kbPushClient() {
    const args   = parseArgs(process.argv.slice(2)),
          errors = validateArgs(args);

    if (errors.length) {
        printUsage();
        errors.forEach(error => console.error(`Error: ${error}`));
        process.exit(1);
    }

    const input = args.fromStdin ? process.stdin : fs.createReadStream(args.fromFile, 'utf8');

    try {
        const payload = await runPush({args, input});

        console.log(JSON.stringify(payload, null, 2));
        process.exit(hasIngestFailure(payload) ? 1 : 0);
    } catch (error) {
        console.error('KB push client failed:', error);
        process.exit(1);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    kbPushClient();
}

export {
    applyEnvelopeDefaults,
    buildServerConfig,
    decodeToolResult,
    hasIngestFailure,
    parseArgs,
    readJsonPayload,
    runPush,
    validateArgs
};
