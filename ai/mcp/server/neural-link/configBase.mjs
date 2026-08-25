import os                     from 'os';
import path                   from 'path';
import {fileURLToPath}        from 'url';
import ConfigProvider, {leaf} from '../../../ConfigProvider.mjs';
import {resolvePlaneDataRoot} from '../../../planeConfig.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
// The single plane-member anchor (env-free twin resolution — the leaf machinery owns env binding).
const planeDataRoot = resolvePlaneDataRoot({rootDir: neoRootDir});

/**
 * @summary Extendable defaults and formulas for the Neural Link MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.neural-link.ConfigBase
 * @extends Neo.ai.ConfigProvider
 */
class ConfigBase extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.ConfigBase'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.ConfigBase',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * Repo root, computed from this module's path. Exported for symmetry with the
             * KB and Memory Core configs so consumers (loggers, services, future) can read
             * `aiConfig.neoRootDir` rather than recomputing the 4-level traversal locally.
             * Module path is stable; the resolution is deterministic at boot.
             * @type {string}
             */
            neoRootDir: leaf(neoRootDir),
            /**
             * Automatically connect to the bridge on startup.
             * @type {boolean}
             */
            autoConnect: leaf(true, 'NEO_NL_AUTO_CONNECT', 'boolean'),
            /**
             * Global debug flag.
             * @type {boolean}
             */
            debug: leaf(false, 'NEO_DEBUG', 'boolean'),
            /**
             * The port the WebSocket server is listening on.
             * @type {number}
             */
            port: leaf(8081, 'NEO_NL_PORT', 'port'),
            /**
             * Timeout for RPC calls in milliseconds.
             * @type {number}
             */
            rpcTimeout: leaf(10000, 'NEO_NL_RPC_TIMEOUT', 'number'),
            /**
             * @summary Whether `RecorderService` writes `nl_action_log` action telemetry. Default OFF.
             *
             * Off by default because action-sequence telemetry is a per-seat opt-in, not a baseline
             * obligation: enabled, every host Neural Link holds a READ/WRITE handle on the shared
             * plane graph — under the container topology a second writer beside the containerized
             * Memory Core — for telemetry the seat never asked to collect. The measurements behind
             * the default election are recorded on the electing ticket and its PR.
             *
             * Scope: this leaf gates the `nl_action_log` telemetry contract ONLY. It never gates
             * the independent `nl_transaction_archive` save/replay contract hosted by the same
             * service, which opens its store on demand. And it gates WHETHER telemetry is
             * written, never WHERE — `memoryCoreDbPath` below stays plane-anchored so an enabled
             * seat writes where `GapInferenceEngine` / `DreamService` read. Un-converging the path
             * would recreate the silent-zero-edges split that convergence repaired. Host-edge NL
             * beside a containerized Memory Core sharing one plane graph is the steady state, not
             * a cutover transient; routing NL writes through MC's remote API instead belongs to
             * the streamable-HTTP direction, tracked separately.
             *
             * Enabled deliberately by `ai/scripts/diagnostics/genesisProbe.mjs`, whose per-tool
             * telemetry oracle reads `nl_action_log` inside its own disposable root. A blanket
             * disable would leave that blind probe comparing against an empty oracle.
             * @type {boolean}
             */
            actionLoggingEnabled: leaf(false, 'NEO_NL_ACTION_LOGGING', 'boolean'),
            /**
             * Path to the memory core SQLite database for action logging.
             * @type {string}
             */
            // Plane-anchored, sharing Memory Core's relative path: same env, SAME artifact. `KBRecorderService` /
            // `RecorderService` write telemetry tables into it, while the readers (`GapInferenceEngine`,
            // `DreamService`) resolve MC's `storagePaths.graph`. The previous homedir default therefore split
            // writers from readers on any seat with the env unset — the recorders wrote to a file the
            // consumers never open, and gap inference silently produced no edges. Converging the default is
            // the repair.
            memoryCoreDbPathProd: leaf(path.resolve(planeDataRoot, 'sqlite/memory-core-graph.sqlite'), 'NEO_MEMORY_DB_PATH', 'string',
                {planeMember: false, planeMemberReason: 'consumer of the Memory Core graph SQLite, not its owner: MC declares `storagePaths.graphProd` and asserts it at its own boot. Mirrors the Chroma persist-dir precedent in the Knowledge Base config — a shared artifact is claimed by its owner and not re-claimed by consumers, so one boot failure names one cause instead of three.'}),
            /**
             * @summary Per-process test destination shared with Knowledge Base telemetry.
             * @type {string}
             */
            memoryCoreDbPathTest: leaf(
                path.join(os.tmpdir(), `neo-memory-core-test-${process.pid}.sqlite`),
                'NEO_TELEMETRY_DB_PATH_TEST',
                'string'
            ),
            /**
             * @summary Selects the disposable telemetry database under Playwright.
             * @type {boolean}
             */
            memoryCoreDbUseTestDatabase: leaf(false, 'UNIT_TEST_MODE', 'boolean'),
            /**
             * @summary Selects disposable telemetry storage in every Playwright mode, including
             * integration/E2E modes which deliberately do not claim UNIT_TEST_MODE semantics.
             * @type {boolean}
             */
            memoryCoreDbUseTestHarness: leaf(false, 'NEO_TEST_CONFIG_TEMPLATES', 'boolean'),
            /**
             * Directory for the always-on Neural Link diagnostic log files. The NL server's
             * `logger.mjs` writes daily-rotated entries here regardless of `debug`, so
             * long-running inspection chains and DOM/VDOM introspection sweeps leave a
             * tail-able diagnostic trail observable from the host shell. Default:
             * `<neoRootDir>/.neo-ai-data/logs/` — shared with the KB and Memory Core servers
             * (each uses a distinct filename prefix: `nl-server-`, `kb-server-`, `mc-server-`).
             * Per-server file isolation, single tailable directory.
             * @type {string}
             */
            logPath: leaf(path.resolve(planeDataRoot, 'logs'), 'NEO_NL_LOG_PATH', 'string', {planeMember: true}),
            /**
             * @summary Retention policy for Neural Link MCP diagnostic log files.
             *
             * The shared logger applies this policy only to files matching the `nl-server`
             * prefix in `logPath`. `maxFiles` and `maxTotalBytes` count historical files;
             * the active current-day file is always preserved. Set `enabled=false` to
             * delegate retention entirely to deployment infrastructure.
             * @type {Object}
             */
            loggerRetention: {
                enabled      : leaf(true, 'NEO_NL_LOG_RETENTION_ENABLED', 'boolean'),
                maxAgeDays   : leaf(14, 'NEO_NL_LOG_RETENTION_MAX_AGE_DAYS', 'number'),
                maxFiles     : leaf(30, 'NEO_NL_LOG_RETENTION_MAX_FILES', 'number'),
                maxTotalBytes: leaf(100 * 1024 * 1024, 'NEO_NL_LOG_RETENTION_MAX_TOTAL_BYTES', 'number')
            },
            /**
             * @summary Shared MCP logger policy for Neural Link.
             *
             * Always-on file sink plus tier-gated stderr: info/warn/error write without
             * debug, while debug stays gated by `debug: true`.
             * @type {Object}
             */
            logger: leaf({
                filePrefix    : 'nl-server',
                fileSink      : true,
                stderrMode    : 'tiered',
                timestampStyle: 'bracketed'
            }),
            /**
             * Maximum characters written when `debug: true` enables full Bridge payload logging.
             * Default/info Bridge receive logs always use bounded routing metadata instead.
             * @type {number}
             */
            bridgePayloadDebugMaxChars: leaf(4096, 'NEO_NL_BRIDGE_PAYLOAD_DEBUG_MAX_CHARS', 'number')
            // `pruneLogsAfterDays` lived here and is REMOVED, not relocated. It retained action logs in
            // "the Neural Link Database" — the host SQLite file this relocation deletes — so after the cut
            // it was a policy number naming a store that no longer exists, with no enforcer on either
            // plane. Telemetry retention is now the container's and is enforced against the boundary its
            // only reader can see (`nlActionTelemetryStore.pruneNlActionTelemetry`, driven by
            // `GapInferenceEngine.inferNlActionDigest`). Re-declaring the days here would recreate the
            // orphan: a host leaf for a container decision.
        },
        formulas: {
            'memoryCoreDbPath': data => data.memoryCoreDbUseTestDatabase || data.memoryCoreDbUseTestHarness ?
                data.memoryCoreDbPathTest : data.memoryCoreDbPathProd
        }
    }
}

/**
 * @summary The plane-member paths declared by Neural Link for static census and profile binding.
 *
 * Neural Link remains seat-local in the parity topology, but its logger config is imported by
 * plane processes such as Memory Core and the orchestrator. Declaring the imported log leaf here
 * keeps the static placement census and `derivePlaneMemberPaths()` completeness proof coupled to
 * the same config contract.
 */
export const PLANE_MEMBER_PATHS = Object.freeze([
    'logPath'
]);

export default Neo.setupClass(ConfigBase);
