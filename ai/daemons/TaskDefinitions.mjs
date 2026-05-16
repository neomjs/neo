import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_POLL_INTERVAL_MS          = 3000;
export const DEFAULT_SUMMARY_SWEEP_INTERVAL_MS = 600000;
export const DEFAULT_KB_SYNC_INTERVAL_MS       = 1800000;
export const DEFAULT_BACKUP_INTERVAL_MS        = 86400000;
export const DEFAULT_PRIMARY_DEV_SYNC_INTERVAL_MS = 600000;
export const PRIMARY_DEV_SYNC_TASK_NAME           = 'primary-dev-sync';
export const DEFAULT_DREAM_INTERVAL_MS            = 3600000;
export const DREAM_TASK_NAME                      = 'dream';
export const DEFAULT_GOLDEN_PATH_INTERVAL_MS      = 3600000;
export const GOLDEN_PATH_TASK_NAME                = 'golden-path';
export const DEFAULT_MLX_MODEL                    = 'gemma-4-31b-it';
export const DEFAULT_MLX_PORT                     = '11435';

export const DEFAULT_DB_PATH    = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
export const DEFAULT_DATA_DIR   = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
export const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../scripts');

/**
 * @summary Builds child-process commands for orchestrator-owned maintenance tasks.
 *
 * The orchestrator intentionally shells out to existing manual maintenance scripts for
 * Piece C instead of reimplementing their internals. This keeps orchestration separate
 * from summarization / KB-sync business logic and gives operators the same scripts for
 * manual recovery.
 *
 * @param {Object} [options]
 * @param {String} [options.scriptDir] Script directory.
 * @param {String} [options.nodeBin] Node executable.
 * @param {String} [options.mlxModel] OpenAI-compatible local inference model.
 * @param {String|Number} [options.mlxPort] OpenAI-compatible local inference port.
 * @returns {Object}
 */
export function buildTaskDefinitions({
    scriptDir = DEFAULT_SCRIPT_DIR,
    nodeBin   = process.argv[0],
    mlxModel  = process.env.NEO_OPENAI_COMPATIBLE_MODEL || DEFAULT_MLX_MODEL,
    mlxPort   = DEFAULT_MLX_PORT
} = {}) {
    return {
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
            args           : [path.join(scriptDir, 'bridge-daemon.mjs')],
            pidFileName    : 'bridge-daemon.pid',
            expectedCommand: 'bridge-daemon.mjs'
        },
        mlx: {
            label          : 'mlx inference',
            command        : path.resolve(scriptDir, '../mcp/server/memory-core/.venv/bin/python'),
            args           : ['-m', 'mlx_lm.server', '--model', mlxModel, '--port', String(mlxPort)],
            pidFileName    : 'mlx.pid',
            expectedCommand: 'mlx_lm.server'
        },
        summary: {
            label          : 'session summarization',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'summarize-sessions.mjs')],
            pidFileName    : 'summarization.pid',
            expectedCommand: 'summarize-sessions.mjs'
        },
        kbSync: {
            label          : 'knowledge base sync',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../../buildScripts/ai/syncKnowledgeBase.mjs')],
            pidFileName    : 'kb-sync.pid',
            expectedCommand: 'syncKnowledgeBase.mjs'
        },
        backup: {
            label          : 'memory core backup',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../../buildScripts/ai/backup.mjs')],
            pidFileName    : 'backup.pid',
            expectedCommand: 'backup.mjs'
        },
        [PRIMARY_DEV_SYNC_TASK_NAME]: {
            label          : 'primary checkout dev sync',
            pidFileName    : 'primary-dev-sync.pid',
            expectedCommand: 'PrimaryRepoSyncService',
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
        }
    };
}
