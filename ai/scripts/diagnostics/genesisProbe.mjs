import {Client}                          from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport}   from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Command, InvalidArgumentError}   from 'commander';
import {spawn, execFileSync}             from 'child_process';
import crypto                            from 'crypto';
import fs                                from 'fs';
import fsPromises                        from 'fs/promises';
import net                               from 'net';
import os                                from 'os';
import path                              from 'path';
import readline                          from 'readline/promises';
import {createRequire}                   from 'module';
import {fileURLToPath, pathToFileURL}    from 'url';
import {createLocalBearerLaunchContract} from '../../mcp/server/shared/helpers/localBearer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../..');
const require    = createRequire(import.meta.url);

export const DEFAULT_TIMEOUT_MS = 60000;
export const MAX_SESSION_MS     = 2 * 60 * 60 * 1000;
export const CLEANUP_RESERVE_MS = 60000;
export const EXACT_TOOL_NAMES   = Object.freeze([
    'healthcheck',
    'get_worker_topology',
    'get_component_tree'
]);
export const EXPECTED_APP_NAME     = 'Neo.examples.grid.bigData';
export const GENESIS_COMMIT        = '2a7e9d75d2e5cceb9d36fd0dc290c7586d9ad4c8';
export const GENESIS_VERSION       = '7.9.38';
export const PROBE_PROJECTION_MODE = 'local-readonly-probe';
export const LOOPBACK_HOST         = '127.0.0.1';

const PUBLIC_FAILURES = Object.freeze({
    CHILD_TERMINATION_UNVERIFIED: 'A probe child could not be verified as stopped.',
    CLEANUP_FAILED              : 'The disposable diagnostics could not be fully erased.',
    PROBE_INTERRUPTED           : 'The probe was interrupted and entered cleanup.',
    SESSION_LIMIT_EXCEEDED      : 'The probe exceeded its two-hour session limit.',
    TOOL_PROFILE_MISMATCH       : 'The server did not expose the exact probe profile.',
    TOPOLOGY_MISMATCH           : 'Exactly one intended BigData App Worker was not available.',
    UNEXPECTED_FAILURE          : 'The probe failed without a public-safe classification.'
});

const SAFE_ENV_KEYS = new Set([
    'CI',
    'COLORTERM',
    'COMSPEC',
    'FORCE_COLOR',
    'HOME',
    'LANG',
    'LC_ALL',
    'LOCALAPPDATA',
    'LOGNAME',
    'NO_COLOR',
    'PATH',
    'PATHEXT',
    'SHELL',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TERM',
    'TMP',
    'TMPDIR',
    'USER',
    'USERPROFILE',
    'WINDIR'
].map(key => key.toUpperCase()));

/**
 * @module ai/scripts/diagnostics/genesisProbe
 * @summary Runs the isolated BigData Neural Link interoperability journey for Genesis.
 *
 * The runner owns one disposable local stack: dev server, standalone Bridge, server-pinned
 * Streamable HTTP Neural Link MCP server, and a headless BigData browser. It verifies the exact
 * three-tool projection with the standard MCP SDK, derives the blind structural oracle, and then
 * erases the entire diagnostic root after child shutdown. External mode keeps the stack alive for
 * the Genesis deliverable and reveals the oracle only after an explicit operator command.
 *
 * @see https://github.com/neomjs/neo/issues/15187
 */

/**
 * @summary Parses one explicit TCP port.
 * @param {String|Number} value CLI value.
 * @returns {Number}
 */
export function parsePort(value) {
    const port = Number(value);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new InvalidArgumentError(`Expected an integer TCP port in the range 1..65535, got '${value}'.`)
    }

    return port
}

/**
 * @summary Parses the one-shot runner CLI without starting any process.
 * @param {String[]} [argv=[]] Arguments without node/script path.
 * @param {Object} [env=process.env] Environment defaults.
 * @returns {Object}
 */
export function parseArgs(argv = [], env = process.env) {
    const program = new Command();

    program
        .name('genesisProbe')
        .description('Run the isolated Genesis ↔ Neural Link BigData interoperability probe.')
        .exitOverride()
        .allowExcessArguments(false)
        .option('--external', 'Keep the stack open for a frozen external Genesis deliverable.', false)
        .option('--headed', 'Show the Chrome window instead of running headless.', false)
        .option('--browser-channel <channel>', 'Playwright browser channel; use "bundled" for bundled Chromium.', env.NEO_GENESIS_BROWSER_CHANNEL || 'chrome')
        .option('--bearer-token-env <name>', 'Environment variable carrying the private external-mode bearer.', env.NEO_GENESIS_BEARER_TOKEN_ENV || 'NEO_GENESIS_PROBE_BEARER')
        .option('--dev-port <port>', 'Explicit isolated dev-server port.', parsePort)
        .option('--bridge-port <port>', 'Explicit isolated Neural Link Bridge port.', parsePort)
        .option('--mcp-port <port>', 'Explicit isolated Streamable HTTP port.', parsePort)
        .option('--timeout-ms <ms>', 'Per-startup/tool-call timeout.', value => {
            const timeoutMs = Number(value);

            if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_SESSION_MS) {
                throw new InvalidArgumentError(`Expected timeout in the range 1000..${MAX_SESSION_MS}ms, got '${value}'.`)
            }

            return timeoutMs
        }, Number(env.NEO_GENESIS_PROBE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

    program.parse(argv, {from: 'user'});

    return program.opts()
}

/**
 * @summary Copies only process-launch essentials, excluding provider, repository, and Neo secrets.
 * @param {Object} [baseEnv=process.env]
 * @returns {Object}
 */
export function createSafeBaseEnv(baseEnv = process.env) {
    const safeEnv = {};

    for (const [key, value] of Object.entries(baseEnv)) {
        if (SAFE_ENV_KEYS.has(key.toUpperCase()) && value !== undefined) {
            safeEnv[key] = value
        }
    }

    return safeEnv
}

/**
 * @summary Builds a least-authority Playwright launch contract so the browser child does not
 * inherit provider, repository, Neo, or external-probe credentials from the operator process.
 * @param {Object} options
 * @param {Object} [options.baseEnv=process.env]
 * @param {String} [options.browserChannel='chrome'] Installed channel or `bundled`.
 * @param {Boolean} [options.headed=false]
 * @returns {Object} Playwright Chromium launch options.
 */
export function createBrowserLaunchOptions({
    baseEnv = process.env,
    browserChannel = 'chrome',
    headed = false
} = {}) {
    const launchOptions = {
        env     : createSafeBaseEnv(baseEnv),
        headless: !headed
    };

    if (browserChannel !== 'bundled') {
        launchOptions.channel = browserChannel
    }

    return launchOptions
}

/**
 * @summary Builds least-authority child environments for the dev server, Bridge, and MCP server.
 * @param {Object} options
 * @param {Object} [options.baseEnv=process.env]
 * @param {String} [options.bearerToken] Optional external-mode token.
 * @param {{dev:Number, bridge:Number, mcp:Number}} options.ports
 * @param {String} options.root Disposable diagnostic root.
 * @returns {{databasePath:String, logPath:String, clientHeaders:Object, devEnv:Object, bridgeEnv:Object, mcpEnv:Object}}
 */
export function createProbeEnvironments({baseEnv = process.env, bearerToken, ports, root}) {
    const
        launchContract = createLocalBearerLaunchContract(bearerToken),
        safeEnv        = createSafeBaseEnv(baseEnv),
        databasePath   = path.join(root, 'memory-core.sqlite'),
        logPath        = root,
        commonEnv      = {
            ...safeEnv,
            FORCE_COLOR              : '0',
            NEO_DEBUG                : 'false',
            NEO_TEST_CONFIG_TEMPLATES: 'false',
            UNIT_TEST_MODE           : 'false'
        },
        devEnv = {
            ...commonEnv,
            NODE_ENV: 'development'
        },
        bridgeEnv = {
            ...commonEnv,
            NEO_NL_LOG_PATH: logPath,
            NEO_NL_PORT    : String(ports.bridge)
        },
        mcpEnv = {
            ...commonEnv,
            ...launchContract.serverEnv,
            HOST                       : LOOPBACK_HOST,
            MCP_HTTP_PORT              : String(ports.mcp),
            NEO_MEMORY_DB_PATH         : databasePath,
            NEO_NL_AUTO_CONNECT        : 'true',
            NEO_NL_LOG_PATH            : logPath,
            NEO_NL_PORT                : String(ports.bridge),
            NEO_NL_TOOL_PROJECTION_MODE: PROBE_PROJECTION_MODE,
            NEO_TRANSPORT              : 'streamable-http'
        };

    assertDiagnosticPathsWithinRoot({databasePath, logPath, root});

    return {
        databasePath,
        logPath,
        clientHeaders: launchContract.clientHeaders,
        devEnv,
        bridgeEnv,
        mcpEnv
    }
}

/**
 * @summary Fails when a configured diagnostic sink escapes the disposable root.
 * @param {Object} options
 * @param {String} options.databasePath
 * @param {String} options.logPath
 * @param {String} options.root
 * @returns {true}
 */
export function assertDiagnosticPathsWithinRoot({databasePath, logPath, root}) {
    const
        resolvedRoot = path.resolve(root),
        candidates   = [databasePath, logPath].map(item => path.resolve(item));

    for (const candidate of candidates) {
        const relative = path.relative(resolvedRoot, candidate);

        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`Diagnostic sink escapes the disposable root: ${candidate}`)
        }
    }

    return true
}

/**
 * @summary Converts the lean depth-2 tree into the fixed-property-order public oracle.
 * @param {Object} tree Lean `get_component_tree` tree payload.
 * @returns {{oracle:Object, canonicalJson:String}}
 */
export function canonicalizeOracle(tree) {
    if (!tree || typeof tree.className !== 'string' || !tree.className) {
        throw new Error('The component-tree response has no root className.')
    }

    const items = tree.items || [];

    if (!Array.isArray(items)) {
        throw new Error('The component-tree response has a non-array items field.')
    }

    const oracle = {
        rootClass     : tree.className,
        directChildren: items.map((item, index) => {
            if (!item || typeof item.className !== 'string' || !item.className) {
                throw new Error(`Direct child ${index} has no className.`)
            }

            return {index, className: item.className}
        })
    };

    return {oracle, canonicalJson: JSON.stringify(oracle)}
}

/**
 * @summary Computes the approved salted oracle commitment.
 * @param {Object} options
 * @param {String} options.canonicalJson Whitespace-free fixed-order oracle JSON.
 * @param {String} options.saltHex Secret 32-byte lowercase-hex salt.
 * @returns {String} Lowercase SHA-256 hex digest.
 */
export function createOracleCommitment({canonicalJson, saltHex}) {
    if (!/^[0-9a-f]{64}$/.test(saltHex || '')) {
        throw new Error('Oracle salt must be exactly 32 bytes encoded as lowercase hex.')
    }

    return crypto
        .createHash('sha256')
        .update(`${saltHex}\n${canonicalJson}`, 'utf8')
        .digest('hex')
}

/**
 * @summary Recursively records relative path, type, and byte size without following symlinks.
 * @param {String} root
 * @returns {Promise<{rootPresent:Boolean, entries:Array<Object>} >}
 */
export async function createManifest(root) {
    try {
        await fsPromises.lstat(root)
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {rootPresent: false, entries: []}
        }
        throw error
    }

    const entries = [];

    async function walk(directory) {
        const names = (await fsPromises.readdir(directory)).sort();

        for (const name of names) {
            const
                absolute = path.join(directory, name),
                relative = path.relative(root, absolute).split(path.sep).join('/'),
                stat     = await fsPromises.lstat(absolute),
                type     = stat.isDirectory() ? 'directory' :
                    stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'other';

            entries.push({path: relative, type, bytes: stat.size});

            if (stat.isDirectory()) {
                await walk(absolute)
            }
        }
    }

    await walk(root);

    return {rootPresent: true, entries}
}

/**
 * @summary Captures a metadata-only path snapshot for the default-path non-touch guard.
 * @param {String} targetPath
 * @returns {Promise<Object>}
 */
export async function snapshotPath(targetPath) {
    try {
        const stat = await fsPromises.lstat(targetPath);

        if (!stat.isDirectory()) {
            return {
                exists : true,
                type   : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'other',
                bytes  : stat.size,
                mtimeMs: stat.mtimeMs
            }
        }

        const manifest = await createManifest(targetPath);

        return {
            exists : true,
            type   : 'directory',
            entries: manifest.entries,
            mtimeMs: stat.mtimeMs
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {exists: false}
        }
        throw error
    }
}

/**
 * @summary Captures the complete SQLite file family for the default-path non-touch guard. WAL
 * mode can mutate the `-wal` or `-shm` sidecar while the main database file stays byte-identical,
 * so all three paths are one proof surface.
 * @param {String} databasePath Main SQLite database path.
 * @returns {Promise<Object>} Metadata snapshots for the main, WAL, and SHM files.
 */
export async function snapshotSqliteFamily(databasePath) {
    const [database, wal, shm] = await Promise.all([
        snapshotPath(databasePath),
        snapshotPath(`${databasePath}-wal`),
        snapshotPath(`${databasePath}-shm`)
    ]);

    return {database, wal, shm}
}

/**
 * @summary Allocates a currently free loopback TCP port.
 * @returns {Promise<Number>}
 */
export async function findFreePort() {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address();
            server.close(error => error ? reject(error) : resolve(port))
        })
    })
}

/**
 * @summary Resolves three distinct explicit-or-ephemeral ports.
 * @param {Object} options Parsed CLI options.
 * @returns {Promise<{dev:Number, bridge:Number, mcp:Number}>}
 */
export async function resolvePorts(options) {
    const ports = {
        dev   : options.devPort    || await findFreePort(),
        bridge: options.bridgePort || await findFreePort(),
        mcp   : options.mcpPort    || await findFreePort()
    };

    if (new Set(Object.values(ports)).size !== 3) {
        throw new Error('Dev-server, Bridge, and MCP ports must be distinct.')
    }

    return ports
}

/**
 * @summary Creates a classified probe error whose public message comes from a closed allowlist.
 * @param {String} code Public failure code.
 * @param {*} [cause] Private in-process cause.
 * @returns {Error}
 */
export function createProbeFailure(code, cause) {
    const resolvedCode = Object.hasOwn(PUBLIC_FAILURES, code) ? code : 'UNEXPECTED_FAILURE';
    const error        = new Error(PUBLIC_FAILURES[resolvedCode]);

    error.code = resolvedCode;

    if (cause !== undefined) {
        Object.defineProperty(error, 'cause', {
            configurable: true,
            value       : cause
        })
    }

    return error
}

/**
 * @summary Redacts any internal failure into the closed public receipt shape.
 * @param {*} error Internal error.
 * @returns {{code:String, message:String}}
 */
export function toPublicProbeError(error) {
    const code = Object.hasOwn(PUBLIC_FAILURES, error?.code) ? error.code : 'UNEXPECTED_FAILURE';

    return {code, message: PUBLIC_FAILURES[code]}
}

/**
 * @summary Returns the smaller of the per-phase budget and the remaining global session budget.
 * @param {Object} options
 * @param {Number} options.deadline Epoch-millisecond deadline.
 * @param {Number} options.timeoutMs Requested phase timeout.
 * @param {Number} [options.now=Date.now()] Injectable current time for deterministic tests.
 * @returns {Number}
 */
export function getPhaseTimeout({deadline, timeoutMs, now = Date.now()}) {
    const remaining = deadline - now;

    if (remaining <= 0) {
        throw createProbeFailure('SESSION_LIMIT_EXCEEDED')
    }

    return Math.min(timeoutMs, remaining)
}

/**
 * @summary Installs idempotent process-signal routing into an AbortController.
 * @param {Object} options
 * @param {AbortController} options.controller Probe lifecycle controller.
 * @param {Object} [options.processTarget=process] EventEmitter-compatible process boundary.
 * @returns {Function} Listener disposer.
 */
export function installProbeSignalHandlers({controller, processTarget = process}) {
    const onSignal = () => {
        if (!controller.signal.aborted) {
            controller.abort(createProbeFailure('PROBE_INTERRUPTED'))
        }
    };

    processTarget.on('SIGINT', onSignal);
    processTarget.on('SIGTERM', onSignal);

    return () => {
        processTarget.off('SIGINT', onSignal);
        processTarget.off('SIGTERM', onSignal)
    }
}

/**
 * @summary Creates the loopback-only webpack dev-server arguments for the disposable stack.
 * @param {Number} port Explicit isolated port.
 * @returns {String[]}
 */
export function createDevServerArgs(port) {
    return [
        require.resolve('webpack-cli/bin/cli.js'),
        'serve',
        '-c',
        path.join(repoRoot, 'buildScripts/webpack/webpack.server.config.mjs'),
        '--host',
        LOOPBACK_HOST,
        '--port',
        String(port),
        '--no-open'
    ]
}

/**
 * @summary Bounds one asynchronous lifecycle operation.
 * @param {Promise} promise
 * @param {Number} timeoutMs
 * @param {String} label
 * @param {AbortSignal} [signal] Probe interruption signal.
 * @returns {Promise<*>}
 */
export async function withTimeout(promise, timeoutMs, label, signal) {
    signal?.throwIfAborted();

    let abortHandler, timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs)
    });
    const contenders = [promise, timeout];

    if (signal) {
        contenders.push(new Promise((resolve, reject) => {
            abortHandler = () => reject(signal.reason || createProbeFailure('PROBE_INTERRUPTED'));
            signal.addEventListener('abort', abortHandler, {once: true})
        }))
    }

    return await Promise.race(contenders).finally(() => {
        clearTimeout(timer);
        if (abortHandler) signal.removeEventListener('abort', abortHandler)
    })
}

/**
 * @summary Probes one literal-loopback TCP port without retaining a socket.
 * @param {Number} port
 * @returns {Promise<Boolean>}
 */
async function isLoopbackPortOpen(port) {
    return await new Promise(resolve => {
        const socket = net.createConnection({host: LOOPBACK_HOST, port});
        const finish = open => {
            socket.destroy();
            resolve(open)
        };

        socket.setTimeout(250);
        socket.once('connect', () => finish(true));
        socket.once('error',   () => finish(false));
        socket.once('timeout', () => finish(false))
    })
}

/**
 * @summary Waits until every disposable listener rejects loopback connections.
 * @param {Number[]} ports
 * @param {Number} timeoutMs
 * @returns {Promise<Boolean>}
 */
export async function waitForPortsClosed(ports, timeoutMs) {
    const deadline = Date.now() + Math.max(0, timeoutMs);

    do {
        const states = await Promise.all(ports.filter(Boolean).map(isLoopbackPortOpen));

        if (states.every(open => !open)) return true;
        await new Promise(resolve => setTimeout(resolve, 50))
    } while (Date.now() < deadline);

    return false
}

/**
 * @summary Waits until a child-owned loopback listener accepts TCP connections.
 * @param {Object} options
 * @param {Object} options.child
 * @param {String} options.label
 * @param {Number} options.port
 * @param {Number} options.timeoutMs
 * @param {Number} [options.deadline] Global session deadline.
 * @param {AbortSignal} [options.signal] Probe interruption signal.
 * @returns {Promise<void>}
 */
export async function waitForPort({child, deadline, label, port, signal, timeoutMs}) {
    const
        startedAt     = Date.now(),
        phaseDeadline = Math.min(startedAt + timeoutMs, deadline || Number.POSITIVE_INFINITY);

    while (Date.now() < phaseDeadline) {
        signal?.throwIfAborted();

        if (hasChildExited(child)) {
            throw new Error(`${label} exited before opening port ${port} (${child.exitCode ?? child.signalCode}).`)
        }

        const connected = await isLoopbackPortOpen(port);

        if (connected) return;

        await withTimeout(
            new Promise(resolve => setTimeout(resolve, 100)),
            getPhaseTimeout({deadline: phaseDeadline, timeoutMs: 100}),
            `${label} retry`,
            signal
        )
    }

    if (deadline && Date.now() >= deadline) throw createProbeFailure('SESSION_LIMIT_EXCEEDED');
    throw new Error(`${label} did not open port ${port} within ${timeoutMs}ms.`)
}

/**
 * @summary Starts a direct child process with stdout/stderr isolated under the probe root.
 * @param {Object} options
 * @returns {Object}
 */
export function spawnLoggedChild({args, command = process.execPath, cwd = repoRoot, env, logPath, name}) {
    const fd = fs.openSync(logPath, 'a', 0o600);
    let child;

    try {
        child = spawn(command, args, {
            cwd,
            env,
            detached   : process.platform !== 'win32',
            stdio      : ['ignore', fd, fd],
            windowsHide: true
        })
    } finally {
        fs.closeSync(fd)
    }

    child.probeName = name;
    return child
}

/**
 * @summary Reports both ordinary and signal-based child-process termination.
 * @param {Object} child
 * @returns {Boolean}
 */
export function hasChildExited(child) {
    return child.exitCode !== null || child.signalCode !== null
}

/**
 * @summary Waits for a child-process leader without losing an exit that races listener setup.
 * @param {Object} child
 * @param {Number} timeoutMs
 * @returns {Promise<Boolean>} Whether the leader exited inside the bounded window.
 */
export async function waitForChildExit(child, timeoutMs) {
    if (hasChildExited(child)) return true;

    return await new Promise(resolve => {
        let timer;
        const onExit = () => {
            clearTimeout(timer);
            resolve(true)
        };

        child.once('exit', onExit);

        if (hasChildExited(child)) {
            child.off('exit', onExit);
            resolve(true);
            return
        }

        timer = setTimeout(() => {
            child.off('exit', onExit);
            resolve(hasChildExited(child))
        }, Math.max(0, timeoutMs))
    })
}

/**
 * @summary Reports whether a detached POSIX process group is still observable.
 * @param {Number} pid Detached process-group leader id.
 * @returns {Boolean|null} Null on Windows where Node cannot prove process-tree absence.
 */
export function isProcessGroupAlive(pid) {
    if (process.platform === 'win32') return null;

    try {
        process.kill(-pid, 0);
        return true
    } catch (error) {
        if (error.code === 'ESRCH') return false;
        if (error.code === 'EPERM') return true;
        throw error
    }
}

/**
 * @summary Waits for both the direct child and its detached POSIX process group to disappear.
 * @param {Object} child
 * @param {Number} timeoutMs
 * @returns {Promise<{leaderExited:Boolean, processGroupExited:Boolean}>}
 */
async function waitForChildTermination(child, timeoutMs) {
    const deadline = Date.now() + Math.max(0, timeoutMs);

    await waitForChildExit(child, timeoutMs);

    let processGroupAlive = isProcessGroupAlive(child.pid);

    while (processGroupAlive === true && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(0, deadline - Date.now()))));
        processGroupAlive = isProcessGroupAlive(child.pid)
    }

    return {
        leaderExited      : hasChildExited(child),
        processGroupExited: processGroupAlive === false
    }
}

/**
 * @summary Stops a detached child tree and fails unless termination is positively verified.
 * @param {Object|null} child
 * @param {String} [signal='SIGTERM']
 * @param {Number} [timeoutMs=5000]
 * @returns {Promise<{forced:Boolean, leaderExited:Boolean, processGroupExited:Boolean}>}
 */
export async function stopChild(child, signal = 'SIGTERM', timeoutMs = 5000) {
    if (!child) {
        return {forced: false, leaderExited: true, processGroupExited: process.platform !== 'win32'}
    }

    let termination = {
        leaderExited      : hasChildExited(child),
        processGroupExited: isProcessGroupAlive(child.pid) === false
    };

    if (termination.leaderExited && (process.platform === 'win32' || termination.processGroupExited)) {
        return {forced: false, ...termination}
    }

    try {
        if (process.platform === 'win32') {
            child.kill(signal)
        } else {
            process.kill(-child.pid, signal)
        }
    } catch (error) {
        if (error.code !== 'ESRCH') throw error
    }

    termination = await waitForChildTermination(child, timeoutMs);

    let forced = false;

    if (!termination.leaderExited || (process.platform !== 'win32' && !termination.processGroupExited)) {
        forced = true;
        try {
            if (process.platform === 'win32') {
                child.kill('SIGKILL')
            } else {
                process.kill(-child.pid, 'SIGKILL')
            }
        } catch (error) {
            if (error.code !== 'ESRCH') throw error
        }

        termination = await waitForChildTermination(child, timeoutMs)
    }

    if (!termination.leaderExited || (process.platform !== 'win32' && !termination.processGroupExited)) {
        throw createProbeFailure('CHILD_TERMINATION_UNVERIFIED', {
            child : child.probeName,
            forced,
            ...termination
        })
    }

    return {forced, ...termination}
}

/**
 * @summary Reads structured JSON from a standard MCP SDK tool response.
 * @param {Object} result
 * @returns {*}
 */
export function readToolJson(result) {
    if (result?.isError) {
        const message = result.content?.find(item => item.type === 'text')?.text || 'Unknown MCP tool error.';
        throw new Error(message)
    }

    if (result?.structuredContent) {
        const keys = Object.keys(result.structuredContent);
        return keys.length === 1 && keys[0] === 'result' ? result.structuredContent.result : result.structuredContent
    }

    const text = result?.content?.find(item => item.type === 'text')?.text;
    if (!text) throw new Error('MCP tool returned no JSON payload.');

    return JSON.parse(text)
}

/**
 * @summary Polls the exact topology tool until the single intended BigData App Worker is present.
 * @param {Object} options
 * @returns {Promise<Array<Object>>}
 */
export async function waitForBigDataTopology({client, deadline, signal, timeoutMs}) {
    const
        startedAt     = Date.now(),
        phaseDeadline = Math.min(startedAt + timeoutMs, deadline || Number.POSITIVE_INFINITY);
    let topology = [];

    while (Date.now() < phaseDeadline) {
        signal?.throwIfAborted();
        topology = readToolJson(await withTimeout(
            client.callTool({name: 'get_worker_topology', arguments: {}}),
            getPhaseTimeout({deadline: phaseDeadline, timeoutMs}),
            'get_worker_topology',
            signal
        ));

        if (Array.isArray(topology) && topology.length === 1 && topology[0]?.appName === EXPECTED_APP_NAME) {
            return topology
        }

        if (Array.isArray(topology) && topology.length > 1) {
            throw createProbeFailure('TOPOLOGY_MISMATCH', {observedCount: topology.length})
        }

        await withTimeout(
            new Promise(resolve => setTimeout(resolve, 200)),
            getPhaseTimeout({deadline: phaseDeadline, timeoutMs: 200}),
            'BigData topology retry',
            signal
        )
    }

    if (deadline && Date.now() >= deadline) throw createProbeFailure('SESSION_LIMIT_EXCEEDED');
    throw createProbeFailure('TOPOLOGY_MISMATCH', {topology})
}

/**
 * @summary Returns aggregate-only Neural Link call counts after the MCP process has released SQLite.
 * @param {String} databasePath
 * @returns {Promise<Array<Object>>}
 */
export async function readAggregateTelemetry(databasePath) {
    try {
        await fsPromises.access(databasePath)
    } catch {
        return []
    }

    const Database = (await import('better-sqlite3')).default;
    const db       = new Database(databasePath, {readonly: true});

    try {
        return db.prepare(`
            SELECT
                tool,
                COUNT(*) AS count,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
                COALESCE(SUM(duration_ms), 0) AS durationMs
            FROM nl_action_log
            GROUP BY tool
            ORDER BY tool
        `).all()
    } finally {
        db.close()
    }
}

/**
 * @summary Captures cleanup evidence independently, then attempts whole-root deletion whenever
 * process termination authorized it. A corrupt telemetry database or failed pre-delete snapshot
 * must fail the receipt without becoming a veto that leaves raw diagnostics behind.
 * @param {Object} options
 * @param {String|null} options.databasePath Isolated SQLite path.
 * @param {Object|null} options.defaultPaths Default live database/log paths.
 * @param {Boolean} options.deletionAuthorized Whether process shutdown proof permits deletion.
 * @param {String} options.root Disposable diagnostic root.
 * @returns {Promise<Object>} Aggregate evidence, manifests, default snapshot, and private failures.
 */
export async function finalizeDisposableRoot({
    databasePath,
    defaultPaths,
    deletionAuthorized,
    root
}) {
    let
        afterManifest  = {rootPresent: null, entries: []},
        beforeManifest = {rootPresent: null, entries: []},
        defaultAfter   = null,
        telemetry      = [];

    const failures = [];
    const capture  = async (label, operation, assign) => {
        try {
            assign(await operation())
        } catch (error) {
            failures.push({error, label})
        }
    };

    if (deletionAuthorized && databasePath) {
        await capture(
            'Aggregate telemetry read',
            () => readAggregateTelemetry(databasePath),
            value => { telemetry = value }
        )
    }

    await capture(
        'Before-manifest capture',
        () => createManifest(root),
        value => { beforeManifest = value }
    );

    if (defaultPaths) {
        await capture(
            'Default-path after snapshot',
            async () => ({
                database: await snapshotSqliteFamily(defaultPaths.database),
                logs    : await snapshotPath(defaultPaths.logs)
            }),
            value => { defaultAfter = value }
        )
    }

    if (deletionAuthorized) {
        await capture(
            'Disposable-root deletion',
            () => fsPromises.rm(root, {recursive: true, force: true}),
            () => {}
        )
    }

    await capture(
        'After-manifest capture',
        () => createManifest(root),
        value => { afterManifest = value }
    );

    return {afterManifest, beforeManifest, defaultAfter, failures, telemetry}
}

/**
 * @summary Emits one machine-readable, secret-free journey event.
 * @param {String} type
 * @param {Object} payload
 */
export function emitEvent(type, payload) {
    process.stdout.write(`${JSON.stringify({type, ...payload})}\n`)
}

/**
 * @summary Resolves current Neo and accepted Genesis version anchors for the final receipt.
 * @param {Object} [options]
 * @param {Number} [options.gitTimeoutMs=5000] Bound for the optional git commit lookup.
 * @returns {Promise<Object>}
 */
export async function readVersionAnchors({gitTimeoutMs = 5000} = {}) {
    const packageJson = JSON.parse(await fsPromises.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
    let   neoCommit   = null;

    try {
        neoCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd     : repoRoot,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'ignore'],
            timeout : Math.max(1, gitTimeoutMs)
        }).trim()
    } catch {
        // Exported source archives may not contain .git; package version remains authoritative there.
    }

    return {
        genesis: {version: GENESIS_VERSION, commit: GENESIS_COMMIT},
        neo    : {version: packageJson.version, commit: neoCommit}
    }
}

/**
 * @summary Captures one bounded external operator command without exposing the bearer.
 * @param {Object} options
 * @param {String[]} options.choices Accepted lowercase commands.
 * @param {Number} options.deadline Epoch-millisecond session deadline.
 * @param {String} options.prompt Prompt written to stderr.
 * @returns {Promise<String>}
 */
async function waitForExternalCommand({choices, deadline, prompt, signal}) {
    if (!process.stdin.isTTY) {
        throw new Error('External mode requires an interactive TTY for the freeze/reveal/review boundaries.')
    }

    const rl = readline.createInterface({input: process.stdin, output: process.stderr});

    try {
        while (true) {
            signal?.throwIfAborted();
            const remainingMs = getPhaseTimeout({deadline, timeoutMs: MAX_SESSION_MS});

            const answer = (await withTimeout(
                rl.question(prompt),
                remainingMs,
                'Genesis external probe session',
                signal
            )).trim().toLowerCase();

            if (choices.includes(answer)) return answer
        }
    } finally {
        rl.close()
    }
}

/**
 * @summary Waits for the external deliverable to freeze before revealing the blind oracle.
 * @param {Number} deadline Epoch-millisecond session deadline.
 * @returns {Promise<'abort'|'reveal'>}
 */
async function waitForExternalFreeze(deadline, signal) {
    return await waitForExternalCommand({
        choices: ['reveal', 'abort'],
        deadline,
        prompt : 'Genesis deliverable frozen? Type "reveal" to reveal the oracle, or "abort": ',
        signal
    })
}

/**
 * @summary Keeps raw diagnostics alive until joint review explicitly authorizes cleanup.
 * @param {Number} deadline Epoch-millisecond session deadline.
 * @returns {Promise<'abort'|'cleanup'>}
 */
async function waitForExternalReview(deadline, signal) {
    return await waitForExternalCommand({
        choices: ['cleanup', 'abort'],
        deadline,
        prompt : 'Joint review complete? Type "cleanup" to erase raw diagnostics, or "abort": ',
        signal
    })
}

/**
 * @summary Runs the complete isolated probe and always attempts whole-root cleanup.
 * @param {Object} options Parsed CLI options.
 * @param {Object} [baseEnv=process.env]
 * @param {Object} [lifecycle]
 * @param {AbortSignal} [lifecycle.signal] Process-interruption signal.
 * @returns {Promise<Object>} Final secret-free receipt.
 */
export async function runProbe(options, baseEnv = process.env, {signal} = {}) {
    const
        startedAt    = new Date(),
        deadline     = startedAt.getTime() + MAX_SESSION_MS,
        workDeadline = deadline - CLEANUP_RESERVE_MS,
        timeoutMs    = Math.min(options.timeoutMs || DEFAULT_TIMEOUT_MS, MAX_SESSION_MS),
        state        = {
            browser  : null,
            client   : null,
            children : {},
            context  : null,
            root     : null,
            transport: null
        };

    const runPhase = (operation, label, requestedTimeoutMs = timeoutMs) => withTimeout(
        Promise.resolve().then(operation),
        getPhaseTimeout({deadline: workDeadline, timeoutMs: requestedTimeoutMs}),
        label,
        signal
    );

    let
        canonicalJson,
        commitment,
        databasePath,
        defaultAfter,
        defaultBefore,
        defaultPaths,
        diagnosticsConfigured = false,
        failure,
        logPath,
        oracle,
        ports,
        revealed = false,
        saltHex,
        telemetry               = [],
        childLeadersExited      = true,
        listenerClosureVerified = process.platform !== 'win32',
        terminationVerified     = process.platform !== 'win32';

    try {
        if (process.platform === 'win32' && options.external) {
            throw createProbeFailure('CHILD_TERMINATION_UNVERIFIED', {
                reason: 'Windows external privacy proof requires supervised process-tree support.'
            })
        }

        await runPhase(() => import('../../../src/Neo.mjs'), 'Neo bootstrap');
        await runPhase(() => import('../../../src/core/_export.mjs'), 'Neo core bootstrap');

        const aiConfig = (await runPhase(
            () => import('../../mcp/server/neural-link/config.mjs'),
            'Neural Link config bootstrap'
        )).default;

        defaultPaths = {
            database: aiConfig.memoryCoreDbPath,
            logs    : aiConfig.logPath
        };
        defaultBefore = {
            database: await runPhase(
                () => snapshotSqliteFamily(defaultPaths.database),
                'Default SQLite-family snapshot'
            ),
            logs    : await runPhase(() => snapshotPath(defaultPaths.logs), 'Default log snapshot')
        };

        state.root = await runPhase(
            () => fsPromises.mkdtemp(path.join(os.tmpdir(), 'neo-genesis-probe-')),
            'Disposable-root creation'
        );
        ports = await runPhase(() => resolvePorts(options), 'Loopback-port allocation');

        const environments = createProbeEnvironments({
            baseEnv,
            bearerToken: options.external ? String(baseEnv[options.bearerTokenEnv] || '').trim() : undefined,
            ports,
            root       : state.root
        });

        if (baseEnv === process.env && options.external) {
            delete process.env[options.bearerTokenEnv]
        }

        ({databasePath, logPath} = environments);
        diagnosticsConfigured = true;

        const bridgeLog = path.join(state.root, 'neural-link-bridge-stdio.log');
        state.children.bridge = spawnLoggedChild({
            args   : [path.join(repoRoot, 'ai/mcp/server/neural-link/run-bridge.mjs')],
            env    : environments.bridgeEnv,
            logPath: bridgeLog,
            name   : 'Neural Link Bridge'
        });
        await waitForPort({
            child   : state.children.bridge,
            deadline: workDeadline,
            label   : 'Neural Link Bridge',
            port    : ports.bridge,
            signal,
            timeoutMs
        });

        state.children.dev = spawnLoggedChild({
            args   : createDevServerArgs(ports.dev),
            env    : environments.devEnv,
            logPath: path.join(state.root, 'dev-server-stdio.log'),
            name   : 'Neo dev server'
        });
        await waitForPort({
            child   : state.children.dev,
            deadline: workDeadline,
            label   : 'Neo dev server',
            port    : ports.dev,
            signal,
            timeoutMs
        });

        state.children.mcp = spawnLoggedChild({
            args   : [path.join(repoRoot, 'ai/mcp/server/neural-link/mcp-server.mjs')],
            env    : environments.mcpEnv,
            logPath: path.join(state.root, 'neural-link-mcp-stdio.log'),
            name   : 'Neural Link MCP server'
        });
        delete environments.mcpEnv.NEO_AUTH_LOCAL_BEARER_TOKEN;

        await waitForPort({
            child   : state.children.mcp,
            deadline: workDeadline,
            label   : 'Neural Link MCP server',
            port    : ports.mcp,
            signal,
            timeoutMs
        });

        const {chromium}    = await runPhase(() => import('playwright'), 'Playwright bootstrap');
        const launchOptions = createBrowserLaunchOptions({
            baseEnv,
            browserChannel: options.browserChannel,
            headed        : options.headed
        });

        state.browser = await runPhase(() => chromium.launch(launchOptions), 'Browser launch');
        state.context = await runPhase(() => state.browser.newContext(), 'Browser context creation');
        const page = await runPhase(() => state.context.newPage(), 'Browser page creation');

        await runPhase(() => page.route('**/examples/grid/bigData/neo-config.json', async route => {
            const response = await route.fetch();
            const config   = await response.json();

            await route.fulfill({
                response,
                json: {
                    ...config,
                    neuralLinkUrl: `ws://${LOOPBACK_HOST}:${ports.bridge}`
                }
            })
        }), 'BigData config route');

        await runPhase(() => page.goto(
            `http://${LOOPBACK_HOST}:${ports.dev}/examples/grid/bigData/index.html`,
            {
                waitUntil: 'domcontentloaded',
                timeout  : getPhaseTimeout({deadline: workDeadline, timeoutMs})
            }
        ), 'BigData navigation');
        await runPhase(() => page.waitForSelector('.neo-grid-container', {
            state  : 'visible',
            timeout: getPhaseTimeout({deadline: workDeadline, timeoutMs})
        }), 'BigData readiness');

        const endpoint = new URL(`http://${LOOPBACK_HOST}:${ports.mcp}/mcp`);
        state.transport = new StreamableHTTPClientTransport(endpoint, {
            requestInit: {
                headers: environments.clientHeaders
            }
        });
        environments.clientHeaders = null;
        state.client = new Client({name: 'neo-genesis-reference-probe', version: '1.0.0'}, {capabilities: {}});

        await runPhase(() => state.client.connect(state.transport), 'MCP connect');

        const listedTools = (await runPhase(() => state.client.listTools(), 'MCP tools/list')).tools.map(tool => tool.name);

        if (JSON.stringify(listedTools) !== JSON.stringify(EXACT_TOOL_NAMES)) {
            throw createProbeFailure('TOOL_PROFILE_MISMATCH', {listedTools})
        }

        const health = readToolJson(await runPhase(
            () => state.client.callTool({name: 'healthcheck', arguments: {}}),
            'healthcheck'
        ));

        if (health.status !== 'healthy') {
            throw createProbeFailure('UNEXPECTED_FAILURE', {healthStatus: health.status})
        }

        const topology = await waitForBigDataTopology({
            client  : state.client,
            deadline: workDeadline,
            signal,
            timeoutMs
        });
        const sessionId = topology[0].appWorkerId;

        if (!sessionId) {
            throw createProbeFailure('TOPOLOGY_MISMATCH', {reason: 'missing-session-id'})
        }

        const treeResult = readToolJson(await runPhase(
            () => state.client.callTool({
                name     : 'get_component_tree',
                arguments: {depth: 2, lean: true, sessionId}
            }),
            'get_component_tree'
        ));

        ({oracle, canonicalJson} = canonicalizeOracle(treeResult.tree));
        saltHex   = crypto.randomBytes(32).toString('hex');
        commitment = createOracleCommitment({canonicalJson, saltHex});

        emitEvent('GENESIS_PROBE_LOCAL_READY', {
            appName       : EXPECTED_APP_NAME,
            authorization : 'Bearer <private-disposable-token>',
            bearerTokenEnv: options.bearerTokenEnv,
            endpoint      : endpoint.toString(),
            profile       : PROBE_PROJECTION_MODE,
            tools         : [...EXACT_TOOL_NAMES],
            treeArguments : {depth: 2, lean: true},
            externalMode  : options.external
        });
        emitEvent('GENESIS_ORACLE_COMMITMENT', {commitment});

        if (options.external) {
            const freezeDecision = await waitForExternalFreeze(workDeadline, signal);

            if (freezeDecision === 'abort') {
                throw new Error('External probe aborted before oracle reveal.')
            }

            revealed = true;
            emitEvent('GENESIS_ORACLE_REVEAL', {canonicalJson, saltHex});

            const reviewDecision = await waitForExternalReview(workDeadline, signal);

            if (reviewDecision === 'abort') {
                throw new Error('External probe aborted after reveal and before joint-review completion.')
            }
        } else {
            revealed = true;
            emitEvent('GENESIS_ORACLE_REVEAL', {canonicalJson, saltHex})
        }
    } catch (error) {
        failure = error
    } finally {
        const cleanupFailures = [];
        const closeResource   = async (label, operation) => {
            if (!operation) return;

            try {
                const remainingMs = Math.max(1, Math.min(5000, deadline - Date.now()));
                await withTimeout(Promise.resolve().then(operation), remainingMs, label)
            } catch (error) {
                cleanupFailures.push({error, label})
            }
        };

        await closeResource('MCP client close', state.client?.close ? () => state.client.close() : null);
        await closeResource('Browser context close', state.context?.close ? () => state.context.close() : null);
        await closeResource('Browser close', state.browser?.close ? () => state.browser.close() : null);

        state.client    = null;
        state.context   = null;
        state.browser   = null;
        state.transport = null;

        for (const [key, childSignal] of [
            ['mcp', 'SIGTERM'],
            ['bridge', 'SIGINT'],
            ['dev', 'SIGTERM']
        ]) {
            try {
                const result = await stopChild(
                    state.children[key],
                    childSignal,
                    Math.max(0, Math.min(5000, deadline - Date.now()))
                );

                childLeadersExited &&= result.leaderExited;
                terminationVerified &&= result.leaderExited && result.processGroupExited
            } catch (error) {
                childLeadersExited = false;
                terminationVerified = false;
                cleanupFailures.push({error, label: `${key} child stop`})
            }
        }

        if (process.platform === 'win32' && !options.external && childLeadersExited) {
            listenerClosureVerified = await waitForPortsClosed(
                Object.values(ports || {}),
                Math.max(0, Math.min(5000, deadline - Date.now()))
            );

            if (!listenerClosureVerified) {
                cleanupFailures.push({
                    error: createProbeFailure('CHILD_TERMINATION_UNVERIFIED'),
                    label: 'Windows listener-closure verification'
                })
            }
        }

        if (cleanupFailures.length) {
            const terminationFailure = cleanupFailures.find(item =>
                item.error?.code === 'CHILD_TERMINATION_UNVERIFIED'
            );

            failure = createProbeFailure(
                terminationFailure ? 'CHILD_TERMINATION_UNVERIFIED' : 'CLEANUP_FAILED',
                {cleanupFailures, primaryFailure: failure}
            )
        }

        state.cleanupDeletionAuthorized = !cleanupFailures.length && (
            terminationVerified || (
                process.platform === 'win32' &&
                !options.external &&
                childLeadersExited &&
                listenerClosureVerified
            )
        );
        state.cleanupFailures = cleanupFailures
    }

    let beforeManifest = {rootPresent: false, entries: []};
    let afterManifest  = {rootPresent: false, entries: []};

    if (failure && state.root) {
        try {
            const serializePrivateCause = cause => {
                if (cause === undefined) return null;

                try {
                    return JSON.parse(JSON.stringify(cause, (key, value) => value instanceof Error ? {
                        code   : value.code || null,
                        message: value.message,
                        name   : value.name,
                        stack  : value.stack || null
                    } : value))
                } catch {
                    return '[private cause was not serializable]'
                }
            };
            const serializePrivateError = error => ({
                cause  : serializePrivateCause(error?.cause),
                code   : error?.code || null,
                message: error?.message || String(error),
                name   : error?.name || null,
                stack  : error?.stack || null
            });

            await fsPromises.writeFile(
                path.join(state.root, 'private-failure.json'),
                JSON.stringify({
                    cleanup: state.cleanupFailures?.map(item => ({
                        error: serializePrivateError(item.error),
                        label: item.label
                    })) || [],
                    primary: serializePrivateError(failure)
                }, null, 2),
                {mode: 0o600}
            )
        } catch (error) {
            failure = createProbeFailure('CLEANUP_FAILED', error)
        }
    }

    if (state.root) {
        const finalization = await finalizeDisposableRoot({
            databasePath,
            defaultPaths,
            deletionAuthorized: state.cleanupDeletionAuthorized,
            root              : state.root
        });

        ({afterManifest, beforeManifest, defaultAfter, telemetry} = finalization);

        if (finalization.failures.length) {
            failure = createProbeFailure(
                terminationVerified ? 'CLEANUP_FAILED' : 'CHILD_TERMINATION_UNVERIFIED',
                {evidenceFailures: finalization.failures, primaryFailure: failure}
            )
        }
    }

    const defaultPathsUntouched = defaultBefore && defaultAfter ?
        JSON.stringify(defaultBefore) === JSON.stringify(defaultAfter) : null;

    if (afterManifest.rootPresent) {
        failure ||= createProbeFailure(
            terminationVerified ? 'CLEANUP_FAILED' : 'CHILD_TERMINATION_UNVERIFIED'
        )
    }
    if (process.platform === 'win32' && !terminationVerified) {
        failure ||= createProbeFailure('CHILD_TERMINATION_UNVERIFIED')
    }
    if (defaultPathsUntouched === false) {
        failure ||= new Error('A default live diagnostic path changed during the isolated probe window.')
    }

    let versions = {
        genesis: {version: GENESIS_VERSION, commit: GENESIS_COMMIT},
        neo    : {version: null, commit: null}
    };

    try {
        const remainingMs = Math.max(1, Math.min(5000, deadline - Date.now()));
        versions = await withTimeout(
            readVersionAnchors({gitTimeoutMs: remainingMs}),
            remainingMs,
            'Version anchors'
        )
    } catch (error) {
        failure ||= Date.now() >= deadline ?
            createProbeFailure('SESSION_LIMIT_EXCEEDED', error) :
            createProbeFailure('UNEXPECTED_FAILURE', error)
    }

    if (Date.now() >= deadline) {
        failure = createProbeFailure('SESSION_LIMIT_EXCEEDED', failure)
    }

    const endedAt = new Date();
    const receipt = {
        status    : failure ? 'failure' : 'success',
        startedAt : startedAt.toISOString(),
        endedAt   : endedAt.toISOString(),
        durationMs: endedAt - startedAt,
        versions,
        profile   : PROBE_PROJECTION_MODE,
        tools     : [...EXACT_TOOL_NAMES],
        oracle    : commitment ? {
            commitment,
            revealed,
            canonicalJson: revealed ? canonicalJson : null,
            saltHex      : revealed ? saltHex : null
        } : null,
        telemetry,
        diagnostics  : {
            configuredInsideDisposableRoot: diagnosticsConfigured,
            beforeManifest,
            afterManifest,
            defaultPathsUntouched,
            listenerClosureVerified,
            terminationVerified
        },
        sessionLimitMs: MAX_SESSION_MS,
        error         : failure ? toPublicProbeError(failure) : null
    };

    emitEvent('GENESIS_PROBE_RECEIPT', receipt);

    if (failure) {
        const publicFailure = toPublicProbeError(failure);
        throw createProbeFailure(publicFailure.code, failure)
    }
    return receipt
}

/**
 * @summary Parses command-line options and runs one probe process.
 * @returns {Promise<void>}
 */
async function main() {
    const controller = new AbortController();
    const dispose    = installProbeSignalHandlers({controller});
    let   options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        dispose();
        if (error.code === 'commander.helpDisplayed') return;
        throw error
    }

    try {
        await runProbe(options, process.env, {signal: controller.signal})
    } finally {
        dispose()
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main()
    } catch (error) {
        process.stderr.write(`Genesis probe failed: ${JSON.stringify(toPublicProbeError(error))}\n`);
        process.exitCode = 1
    }
}
