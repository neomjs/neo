#!/usr/bin/env node

import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioServerTransport}          from '@modelcontextprotocol/sdk/server/stdio.js';
import {Command}                       from 'commander';
import {pathToFileURL}                 from 'node:url';

const
    RUNTIME_FAILURE_MESSAGE = 'Neo MCP bridge transport failed.',
    STARTUP_FAILURE_MESSAGE = 'Neo MCP bridge failed to start.';

/**
 * @summary Mark one fixed, locally-authored bridge configuration diagnostic as safe for stderr.
 */
class BridgeConfigurationError extends Error {
    /**
     * @summary Create a trusted configuration failure before transport startup.
     * @param {String} message Fixed local diagnostic without raw endpoint or bearer material.
     */
    constructor(message) {
        super(message);

        this.name = 'BridgeConfigurationError'
    }
}

/**
 * @summary Build the fail-loud CLI grammar for Neo's deliberately narrow local bridge.
 * The bearer value is read from an inherited environment slot and never accepted on argv.
 * @returns {Command}
 */
export function createProgram() {
    return new Command()
        .name('neo-mcp-stdio-to-streamable-http')
        .description('Bridge one local stdio MCP client to one Streamable HTTP endpoint.')
        .requiredOption('--url <url>', 'Streamable HTTP MCP endpoint')
        .requiredOption('--token-env <name>', 'Inherited environment variable holding the bearer token')
}

/**
 * @summary Parse and validate the public, non-secret bridge arguments.
 * @param {String[]} argv Argument vector without the Node executable or script path.
 * @returns {{endpoint: URL, tokenEnv: String}}
 */
export function parseArgs(argv) {
    const program = createProgram()
        .configureOutput({writeErr: () => {}})
        .exitOverride();

    program.parse(argv, {from: 'user'});

    const
        {url, tokenEnv} = program.opts();
    let endpoint;

    try {
        endpoint = new URL(url)
    } catch {
        throw new BridgeConfigurationError('Bridge endpoint must be a valid URL.')
    }

    if (!['http:', 'https:'].includes(endpoint.protocol)) {
        throw new BridgeConfigurationError("Bridge endpoint protocol must be 'http:' or 'https:'.")
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv)) {
        throw new BridgeConfigurationError(
            'Bridge token environment slot must be a valid environment variable name.'
        )
    }

    return {endpoint, tokenEnv}
}

/**
 * @summary Select the only startup detail permitted to cross the executable stderr boundary.
 * @param {*} error Startup rejection.
 * @returns {String}
 */
export function getStartupFailureMessage(error) {
    return error instanceof BridgeConfigurationError
        ? error.message
        : STARTUP_FAILURE_MESSAGE
}

/**
 * @summary Wire two MCP SDK transports without terminating either protocol endpoint.
 * Initialization responses propagate the negotiated protocol version into the HTTP transport;
 * either close or error closes both sides exactly once.
 * @param {Object} options
 * @param {Object} options.localTransport Stdio-facing server transport.
 * @param {Object} options.remoteTransport Streamable-HTTP-facing client transport.
 * @param {Function} [options.onError]
 * @returns {Promise<{close: Function}>}
 */
export async function bridgeTransports({
    localTransport,
    remoteTransport,
    onError = () => process.stderr.write(`${RUNTIME_FAILURE_MESSAGE}\n`)
}) {
    let
        closePromise          = null,
        initializeRequestId,
        terminalErrorReported = false;

    const close = ({terminate=true} = {}) => {
        if (closePromise) return closePromise;

        closePromise = Promise.resolve().then(async () => {
            if (terminate) {
                try {
                    await remoteTransport.terminateSession?.()
                } catch {
                    // Session termination is best-effort during an already-requested shutdown.
                }
            }

            await Promise.allSettled([
                localTransport.close(),
                remoteTransport.close()
            ])
        });

        return closePromise
    };

    const fail = () => {
        if (terminalErrorReported || closePromise) return;

        terminalErrorReported = true;

        try {
            onError(new Error(RUNTIME_FAILURE_MESSAGE))
        } catch {
            // A reporter failure must never prevent transport cleanup.
        }

        void close({terminate: false})
    };

    localTransport.onmessage = message => {
        if (message.method === 'initialize' && Object.hasOwn(message, 'id')) {
            initializeRequestId = message.id
        }

        Promise.resolve()
            .then(() => remoteTransport.send(message))
            .catch(fail)
    };
    remoteTransport.onmessage = message => {
        const isInitializeResponse =
            initializeRequestId !== undefined &&
            Object.hasOwn(message, 'id') &&
            message.id === initializeRequestId &&
            (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'));

        if (isInitializeResponse) {
            initializeRequestId = undefined;

            if (typeof message.result?.protocolVersion === 'string') {
                remoteTransport.setProtocolVersion?.(message.result.protocolVersion)
            }
        }

        Promise.resolve()
            .then(() => localTransport.send(message))
            .catch(fail)
    };
    localTransport.onerror  = fail;
    remoteTransport.onerror = fail;
    localTransport.onclose  = () => void close();
    remoteTransport.onclose = () => void close({terminate: false});

    try {
        await remoteTransport.start();
        await localTransport.start()
    } catch (error) {
        await close({terminate: false});
        throw error
    }

    return {close: () => close()}
}

/**
 * @summary Start the fixed-bearer stdio-to-Streamable-HTTP bridge.
 * @param {Object} options
 * @param {URL} options.endpoint
 * @param {String} options.token Bearer value read from the inherited environment only.
 * @param {Object} [options.localTransport]
 * @param {Object} [options.remoteTransport]
 * @param {Function} [options.onError]
 * @returns {Promise<{close: Function}>}
 */
export async function startBridge({
    endpoint,
    token,
    localTransport = new StdioServerTransport(),
    remoteTransport = null,
    onError
}) {
    if (typeof token !== 'string' || token.length === 0) {
        throw new BridgeConfigurationError('Bridge bearer environment slot is missing or empty.')
    }

    remoteTransport ||= new StreamableHTTPClientTransport(endpoint, {
        requestInit: {
            headers: {Authorization: `Bearer ${token}`}
        }
    });

    return bridgeTransports({localTransport, remoteTransport, onError})
}

/**
 * @summary CLI entrypoint. Only public endpoint and environment-slot name cross argv.
 * @param {String[]} [argv]
 * @param {Object} [env]
 * @returns {Promise<{close: Function}>}
 */
export async function main(argv=process.argv.slice(2), env=process.env) {
    const
        {endpoint, tokenEnv} = parseArgs(argv),
        token                = env[tokenEnv];

    if (typeof token !== 'string' || token.length === 0) {
        throw new BridgeConfigurationError('Bridge bearer environment slot is missing or empty.')
    }

    const
        bridge               = await startBridge({
            endpoint,
            token,
            onError: () => {
                process.exitCode = 1;
                process.stderr.write(`${RUNTIME_FAILURE_MESSAGE}\n`)
            }
        });

    const close = () => void bridge.close();

    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    process.stdin.once('end', close);

    return bridge
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        if (error?.code !== 'commander.helpDisplayed') {
            process.stderr.write(`${getStartupFailureMessage(error)}\n`)
        }
        process.exitCode = error?.code === 'commander.helpDisplayed' ? 0 : 1
    })
}
