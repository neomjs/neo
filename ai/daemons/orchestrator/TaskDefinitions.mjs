import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_DB_PATH    = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
export const DEFAULT_DATA_DIR   = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
export const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../../scripts');

/**
 * @summary Builds child-process commands for orchestrator-owned maintenance tasks.
 *
 * Pure function: receives concrete `mlxEnabled` / `mlxModel` / `mlxPort` and
 * `lmsEnabled` / `lmsModel` / `lmsPort` values from the caller; performs no env-var
 * lookups and carries no embedded MLX or LM Studio defaults. The canonical defaults
 * live in `ai/config.template.mjs` under `orchestrator.mlx` and `orchestrator.lms`;
 * `Orchestrator` exposes them via env-overrideable getters
 * (`mlxEnabled`/`mlxModel`/`mlxPort`/`lmsEnabled`/`lmsModel`/`lmsPort`) and forwards
 * the resolved values via `Orchestrator.start()`.
 *
 * The orchestrator intentionally shells out to existing manual maintenance scripts for
 * Piece C instead of reimplementing their internals. This keeps orchestration separate
 * from summarization / KB-sync business logic and gives operators the same scripts for
 * manual recovery.
 *
 * @param {Object} [options]
 * @param {String} [options.scriptDir] Script directory.
 * @param {String} [options.nodeBin] Node executable.
 * @param {Boolean} [options.mlxEnabled=false] Whether to launch an orchestrator-owned mlx_lm.server.
 * @param {String} [options.mlxModel] MLX launch model: a Hugging Face repo id or local path.
 * @param {String|Number} [options.mlxPort] MLX OpenAI-compatible local inference port.
 * @param {Boolean} [options.lmsEnabled=false] Whether to launch an orchestrator-owned LM Studio CLI server.
 * @param {String} [options.lmsModel] LM Studio model identifier (informational; lifecycle currently spawns `lms server start` only — see #11986 AC5 for the model-load probe follow-up).
 * @param {String|Number} [options.lmsPort] LM Studio OpenAI-compatible local inference port (CLI default `1234`).
 * @returns {Object}
 */
export function buildTaskDefinitions({
    scriptDir  = DEFAULT_SCRIPT_DIR,
    nodeBin    = process.argv[0],
    mlxEnabled = false,
    mlxModel,
    mlxPort,
    lmsEnabled = false,
    lmsModel,
    lmsPort
} = {}) {
    const tasks = {
        chroma: {
            label          : 'chroma daemon',
            command        : 'chroma',
            args           : ['run', '--path', '.neo-ai-data/chroma/knowledge-base', '--port', '8000'],
            pidFileName    : 'chroma.pid',
            expectedCommand: 'chroma'
        },
        bridgeDaemon: {
            label          : 'bridge daemon',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../daemons/bridge/daemon.mjs')],
            pidFileName    : 'bridge-daemon.pid',
            expectedCommand: 'daemons/bridge/daemon.mjs'
        },
        summary: {
            label          : 'session summarization',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'lifecycle', 'summarize-sessions.mjs')],
            pidFileName    : 'summarization.pid',
            expectedCommand: 'summarize-sessions.mjs'
        },
        kbSync: {
            label          : 'knowledge base sync',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'syncKnowledgeBase.mjs')],
            pidFileName    : 'kb-sync.pid',
            expectedCommand: 'syncKnowledgeBase.mjs'
        },
        backup: {
            label          : 'agent OS backup',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'backup.mjs')],
            pidFileName    : 'backup.pid',
            expectedCommand: 'backup.mjs'
        },
        'primary-dev-sync': {
            label          : 'primary checkout dev sync',
            pidFileName    : 'primary-dev-sync.pid',
            expectedCommand: 'PrimaryRepoSyncService',
            serviceTask    : true
        },
        'tenant-repo-sync': {
            label          : 'tenant repo sync (cloud)',
            pidFileName    : 'tenant-repo-sync.pid',
            expectedCommand: 'TenantRepoSyncService',
            serviceTask    : true
        },
        dream: {
            label          : 'REM sleep graph extraction',
            pidFileName    : 'dream.pid',
            expectedCommand: 'DreamService',
            serviceTask    : true
        },
        'golden-path': {
            label          : 'golden path synthesis',
            pidFileName    : 'golden-path.pid',
            expectedCommand: 'GoldenPathSynthesizer',
            serviceTask    : true
        },
        'swarm-heartbeat': {
            label          : 'swarm heartbeat pulse',
            pidFileName    : 'swarm-heartbeat.pid',
            expectedCommand: 'SwarmHeartbeatService',
            serviceTask    : true
        }
    };

    if (mlxEnabled) {
        tasks.mlx = {
            label          : 'mlx inference',
            command        : path.resolve(scriptDir, '../mcp/server/memory-core/.venv/bin/python'),
            args           : ['-m', 'mlx_lm.server', '--model', mlxModel, '--port', String(mlxPort)],
            pidFileName    : 'mlx.pid',
            expectedCommand: 'mlx_lm.server'
        };
    }

    if (lmsEnabled) {
        tasks.lms = {
            label          : 'lms server (LM Studio CLI)',
            command        : 'lms',
            args           : ['server', 'start', '--port', String(lmsPort)],
            pidFileName    : 'lms.pid',
            expectedCommand: 'lms server'
        };
    }

    return tasks;
}
