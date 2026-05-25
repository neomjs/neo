import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const PRIMARY_DEV_SYNC_TASK_NAME           = 'primary-dev-sync';
export const TENANT_REPO_SYNC_TASK_NAME           = 'tenant-repo-sync';
export const DREAM_TASK_NAME                      = 'dream';
export const GOLDEN_PATH_TASK_NAME                = 'golden-path';
export const SWARM_HEARTBEAT_TASK_NAME            = 'swarm-heartbeat';

export const DEFAULT_DB_PATH    = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
export const DEFAULT_DATA_DIR   = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
export const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../../scripts');

/**
 * @summary Builds child-process commands for orchestrator-owned maintenance tasks.
 *
 * Pure function: receives concrete `mlxEnabled` / `mlxModel` / `mlxPort` values from the
 * caller; performs no env-var lookups and carries no embedded MLX defaults. The
 * canonical MLX defaults live in `ai/config.template.mjs` under `orchestrator.mlx`;
 * `daemon.mjs::resolveMlxConfig` applies env-var overrides and forwards the resolved
 * values via `Orchestrator.start({mlxEnabled, mlxModel, mlxPort})`.
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
 * @param {String|Number} [options.mlxPort] OpenAI-compatible local inference port.
 * @returns {Object}
 */
export function buildTaskDefinitions({
    scriptDir  = DEFAULT_SCRIPT_DIR,
    nodeBin    = process.argv[0],
    mlxEnabled = false,
    mlxModel,
    mlxPort
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
            label          : 'memory core backup',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'maintenance', 'backup.mjs')],
            pidFileName    : 'backup.pid',
            expectedCommand: 'backup.mjs'
        },
        [PRIMARY_DEV_SYNC_TASK_NAME]: {
            label          : 'primary checkout dev sync',
            pidFileName    : 'primary-dev-sync.pid',
            expectedCommand: 'PrimaryRepoSyncService',
            serviceTask    : true
        },
        [TENANT_REPO_SYNC_TASK_NAME]: {
            label          : 'tenant repo sync (cloud)',
            pidFileName    : 'tenant-repo-sync.pid',
            expectedCommand: 'TenantRepoSyncService',
            serviceTask    : true
        },
        [DREAM_TASK_NAME]: {
            label          : 'REM sleep graph extraction',
            pidFileName    : 'dream.pid',
            expectedCommand: 'DreamService',
            serviceTask    : true
        },
        [GOLDEN_PATH_TASK_NAME]: {
            label          : 'golden path synthesis',
            pidFileName    : 'golden-path.pid',
            expectedCommand: 'GoldenPathSynthesizer',
            serviceTask    : true
        },
        [SWARM_HEARTBEAT_TASK_NAME]: {
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

    return tasks;
}
