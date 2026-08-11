/**
 * @plane in-plane
 */
// Neo namespace bootstrap (entry-point invariant) — hosted community batch push client.
import 'dotenv/config';
import {Command}                from 'commander';
import Neo                      from '../../../src/Neo.mjs';
import * as core                from '../../../src/core/_export.mjs';
import crypto                   from 'crypto';
import fs                       from 'fs';
import {pathToFileURL}          from 'url';
import Client                   from '../../mcp/client/Client.mjs';
import {validateHostedEnvelope} from '../../services/memory-core/communityBatchContract.mjs';

/**
 * @module ai/scripts/maintenance/communityBatchPushClient
 * @summary Bounded authenticated client for hosted community-activity batch admission.
 */

const DEFAULT_TOKEN_ENV = 'NEO_COMMUNITY_BATCH_TOKEN';

/**
 * @summary Creates an isolated Commander parser for one invocation.
 * @returns {Command}
 */
function createArgParser() {
    return new Command()
        .name('community-batch-push-client')
        .description('Push one authority-free community batch to hosted Memory Core admission')
        .exitOverride()
        .configureOutput({writeErr: () => {}, writeOut: () => {}})
        .allowExcessArguments(false)
        .option('--allow-unauthenticated', 'Allow missing bearer token for local demo deployments only')
        .option('--client-name <name>', 'MCP client name')
        .option('--from-file <path>', 'Read one JSON connector envelope from a file')
        .option('--from-stdin', 'Read one JSON connector envelope from stdin')
        .option('--max-attempts <count>', 'Bounded attempts for unknown-outcome transport failures')
        .option('--token-env <name>', 'Environment variable containing the bearer token')
        .option('--transport <type>', 'Remote MCP transport: streamable-http')
        .option('--url <url>', 'Remote Memory Core MCP endpoint URL')
}

/**
 * @summary Parses push-client argv and environment defaults.
 * @param {String[]} argv
 * @param {Object} env
 * @returns {Object}
 */
function parseArgs(argv, env = process.env) {
    const program    = createArgParser();
    let   parseError = null;

    try {
        program.parse(argv, {from: 'user'})
    } catch (error) {
        parseError = error.message
    }

    const
        options  = program.opts(),
        tokenEnv = options.tokenEnv || env.NEO_COMMUNITY_BATCH_TOKEN_ENV || DEFAULT_TOKEN_ENV,
        token    = (tokenEnv ? env[tokenEnv] : null) || null,
        args     = {
            allowUnauthenticated: Boolean(options.allowUnauthenticated),
            clientName          : options.clientName || 'neo-community-batch-push-client',
            fromFile            : options.fromFile || null,
            fromStdin           : Boolean(options.fromStdin),
            maxAttempts         : Number(options.maxAttempts || env.NEO_COMMUNITY_BATCH_MAX_ATTEMPTS || 2),
            token,
            tokenEnv,
            transport           : options.transport || env.NEO_MEMORY_CORE_MCP_TRANSPORT || 'streamable-http',
            url                 : options.url || env.NEO_MEMORY_CORE_MCP_URL || null
        };

    if (parseError) args.parseError = parseError;

    return args
}

/**
 * @summary Reads one JSON connector envelope from a stream.
 * @param {ReadableStream} input
 * @returns {Promise<Object>}
 */
async function readJsonPayload(input) {
    let text = '';

    for await (const chunk of input) text += chunk;

    if (!text.trim()) throw new Error('No JSON payload provided.');

    return JSON.parse(text)
}

/**
 * @summary Builds transient remote MCP configuration without persisting the bearer token.
 * @param {Object} args
 * @returns {Object}
 */
function buildServerConfig(args) {
    const headers = args.token ? {Authorization: `Bearer ${args.token}`} : {};

    return {
        transportType   : args.transport,
        url             : args.url,
        transportOptions: Object.keys(headers).length ? {requestInit: {headers}} : {}
    }
}

/**
 * @summary Decodes a standard MCP text result when it contains JSON.
 * @param {Object} result
 * @returns {*}
 */
function decodeToolResult(result) {
    const text = result?.content?.find?.(entry => entry.type === 'text')?.text;

    if (!text) return result;

    try {
        return JSON.parse(text)
    } catch {
        return result
    }
}

/**
 * @summary Detects a structured refusal that should fail the connector process.
 * @param {*} payload
 * @returns {Boolean}
 */
function hasPushFailure(payload) {
    return Boolean(payload?.isError || payload?.error || payload?.status === 'conflict')
}

/**
 * @summary Pushes the exact same envelope across a bounded lost-response retry loop.
 * @param {Object} options
 * @param {Object} options.args
 * @param {ReadableStream} options.input
 * @param {Function} [options.clientFactory]
 * @returns {Promise<*>}
 */
async function runPush({args, input, clientFactory}) {
    const envelope   = await readJsonPayload(input),
          validation = validateHostedEnvelope(envelope);

    if (!validation.valid) {
        return {
            status: 'conflict',
            reason: 'HOSTED_BOUNDARY_REJECTED',
            code  : validation.errors.some(error => error.endsWith('_EXCEEDED'))
                ? 'COMMUNITY_BATCH_VOLUME_EXCEEDED'
                : 'COMMUNITY_BATCH_ENVELOPE_INVALID',
            errors: validation.errors,
            volume: validation.volume
        }
    }

    const
        connectionConfig = buildServerConfig(args),
        serverName       = `community-batch-push-${crypto.randomUUID()}`;

    let client;

    try {
        client = clientFactory
            ? clientFactory({connectionConfig, serverName, clientName: args.clientName})
            : Neo.create(Client, {connectionConfig, serverName, clientName: args.clientName});

        await client.ready?.();

        let lastError;

        for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
            try {
                return decodeToolResult(await client.callTool('admit_community_batch', envelope))
            } catch (error) {
                lastError = error;
                if (attempt === args.maxAttempts) throw error
            }
        }

        throw lastError
    } finally {
        await client?.close?.()
    }
}

/**
 * @summary Validates CLI arguments before file or network work.
 * @param {Object} args
 * @returns {String[]}
 */
function validateArgs(args) {
    if (args.parseError) return [args.parseError];

    const errors = [];

    if (!args.url) errors.push('Missing --url or NEO_MEMORY_CORE_MCP_URL.');
    if (!args.fromFile && !args.fromStdin) errors.push('Provide --from-file or --from-stdin.');
    if (args.fromFile && args.fromStdin) errors.push('Use only one of --from-file or --from-stdin.');
    if (args.fromFile && !fs.existsSync(args.fromFile)) errors.push(`--from-file path does not exist: ${args.fromFile}`);
    if (!['streamable-http', 'streamableHttp'].includes(args.transport)) {
        errors.push(`Unsupported --transport '${args.transport}'. Expected streamable-http.`)
    }
    if (!Number.isInteger(args.maxAttempts) || args.maxAttempts < 1 || args.maxAttempts > 3) {
        errors.push('--max-attempts must be an integer from 1 to 3.')
    }
    if (!args.allowUnauthenticated && !args.token) {
        errors.push(`Missing bearer token: set --token-env or ${DEFAULT_TOKEN_ENV}.`)
    }

    return errors
}

/**
 * @summary CLI entry point.
 * @returns {Promise<void>}
 */
async function communityBatchPushClient() {
    const args   = parseArgs(process.argv.slice(2)),
          errors = validateArgs(args);

    if (errors.length) {
        errors.forEach(error => console.error(`Error: ${error}`));
        process.exit(1)
    }

    const input = args.fromStdin ? process.stdin : fs.createReadStream(args.fromFile, 'utf8');

    try {
        const payload = await runPush({args, input});

        console.log(JSON.stringify(payload, null, 2));
        process.exit(hasPushFailure(payload) ? 1 : 0)
    } catch (error) {
        const message = args.token ? String(error.message || error).split(args.token).join('[redacted]') : error.message;

        console.error('Community batch push failed:', message);
        process.exit(1)
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    communityBatchPushClient()
}

export {
    buildServerConfig,
    decodeToolResult,
    hasPushFailure,
    parseArgs,
    readJsonPayload,
    runPush,
    validateArgs
};
