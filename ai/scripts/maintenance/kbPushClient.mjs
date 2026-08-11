/**
 * @plane in-plane
 */
// Neo namespace bootstrap (entry-point invariant) - tenant-side KB push client.
// Mirrors ai/scripts/maintenance/ingestTenant.mjs so this CLI can use Neo's MCP client
// wrapper from a tenant checkout or CI job.
import 'dotenv/config';
import {Command}       from 'commander';
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';
import fs              from 'fs';
import {pathToFileURL} from 'url';
import Client          from '../../mcp/client/Client.mjs';
import ClientConfig    from '../../mcp/client/config.mjs';

/**
 * @module ai/scripts/maintenance/kbPushClient
 *
 * @summary Tenant-side repo-push client for the KB `ingest_source_files` MCP facade.
 *
 * This is the operator-facing invocation primitive for the MCP-over-StreamableHTTP path.
 * Tenant hooks or CI jobs build a content-bearing ingestion envelope, then this
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
 */

const DEFAULT_TOKEN_ENV = 'NEO_KB_INGEST_TOKEN';

/**
 * @summary Creates an isolated Commander parser for one invocation.
 * @returns {Command}
 */
function createArgParser() {
    const program = new Command();

    program
        .name('kb-push-client')
        .description('Tenant-side repo-push client for the KB ingest_source_files MCP facade')
        .exitOverride()
        .configureOutput({
            writeErr: () => {},
            writeOut: () => {}
        })
        .allowExcessArguments(false)
        .option('--allow-unauthenticated', 'Allow missing bearer token for local demo deployments only')
        .option('--client-name <name>', 'MCP client name')
        .option('--from-file <path>', 'Read one JSON ingestion envelope from a file')
        .option('--from-stdin', 'Read one JSON ingestion envelope from stdin')
        .option('--repo-slug <slug>', 'Default repoSlug for the envelope')
        .option('--tenant-id <tenantId>', 'Default tenantId for the envelope')
        .option('--token <token>', 'Bearer token value')
        .option('--token-env <name>', 'Environment variable containing the bearer token')
        .option('--transport <type>', 'Remote MCP transport: streamable-http or sse')
        .option('--url <url>', 'Remote KB MCP endpoint URL');

    return program;
}

/**
 * @summary Parses the tenant push-client CLI argv.
 * @param {String[]} argv `process.argv.slice(2)`.
 * @param {Object} env Environment defaults; injected by tests.
 * @returns {Object}
 */
function parseArgs(argv, env = process.env) {
    const program    = createArgParser();
    let   parseError = null;

    try {
        program.parse(argv, {from: 'user'});
    } catch (error) {
        parseError = error.message;
    }

    const options  = program.opts(),
          tokenEnv = options.tokenEnv || env.NEO_KB_TOKEN_ENV || DEFAULT_TOKEN_ENV,
          token    = options.token || (tokenEnv ? env[tokenEnv] : null) || null;

    const args = {
        allowUnauthenticated: Boolean(options.allowUnauthenticated),
        clientName          : options.clientName || 'neo-kb-push-client',
        fromFile            : options.fromFile || null,
        fromStdin           : Boolean(options.fromStdin),
        repoSlug            : options.repoSlug || env.NEO_KB_REPO_SLUG || null,
        tenantId            : options.tenantId || env.NEO_KB_TENANT_ID || null,
        token,
        tokenEnv,
        transport           : options.transport || env.NEO_KB_MCP_TRANSPORT || 'streamable-http',
        url                 : options.url || env.NEO_KB_MCP_URL || null
    };

    if (parseError) {
        args.parseError = parseError;
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
    const envelope   = applyEnvelopeDefaults(await readJsonPayload(input), args),
          serverName = `knowledge-base-push-${Date.now()}`;

    clientConfig.data.mcpServers[serverName] = buildServerConfig(args);

    const client = clientFactory
        ? clientFactory({serverName, clientName: args.clientName})
        : Neo.create(Client, {serverName, clientName: args.clientName});

    try {
        await client.ready?.();
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

    if (args.parseError) {
        return [args.parseError];
    }

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
