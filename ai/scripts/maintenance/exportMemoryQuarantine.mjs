/**
 * @plane in-plane
 */
import {Command}       from 'commander';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

// Neo namespace bootstrap for SDK singletons consumed by operator-run maintenance scripts.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import mcConfig        from '../../mcp/server/memory-core/config.mjs';

import {
    Memory_LifecycleService,
    Memory_StorageRouter
} from '../../services.mjs';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const DEFAULT_QUARANTINE_ROOT = path.join(PROJECT_ROOT, '.neo-ai-data', 'backups');

const PAYLOAD_FIELDS = ['prompt', 'thought', 'response'];

/**
 * @module ai/scripts/maintenance/exportMemoryQuarantine
 * @summary Selected-record Memory Core quarantine exporter.
 *
 * Exports exact `neo-agent-memory` ids into restore-compatible JSONL files without mutating
 * Chroma or SQLite. The output is intentionally shaped for rollback through the existing
 * `Memory_DatabaseService.manageDatabaseBackup({action: 'import', mode: 'merge'})` path:
 *
 * ```
 * .neo-ai-data/backups/quarantine-<ISO-timestamp>/
 * ├── mc/memory-backup-quarantine-<timestamp>.jsonl
 * ├── graph/graph-backup-quarantine-<timestamp>.jsonl
 * └── quarantine-manifest-<timestamp>.json
 * ```
 *
 * The JSONL backup contains full selected records for rollback. The manifest is public-safe:
 * it contains ids, classes, timestamps, session ids, graph/provenance status, and file paths,
 * but never raw prompt/thought/response payload content.
 */

/**
 * Parses CLI arguments for selected-record quarantine export.
 *
 * @param {String[]} argv CLI argv slice.
 * @param {Object} [env=process.env] Environment source.
 * @returns {Object}
 */
export function parseArgs(argv, env = process.env) {
    const program = new Command();

    program
        .name('ai:export-memory-quarantine')
        .description('Export exact Memory Core memory ids into restore-compatible quarantine artifacts.')
        .exitOverride()
        .configureOutput({
            writeErr: () => {},
            writeOut: () => {}
        })
        .helpOption(false)
        .allowExcessArguments(false)
        .argument('[ids...]', 'Memory ids to export. Comma-separated values are accepted.')
        .option('--ids <csv>', 'Comma-separated memory ids.')
        .option('--ids-file <path>', 'File containing ids as JSON array/object or newline/CSV text.')
        .option('--output-dir <path>', 'Output directory.', env.NEO_MEMORY_QUARANTINE_OUTPUT_DIR || null)
        .option('--graph-db <path>', 'Memory Core graph SQLite path.', env.NEO_MEMORY_GRAPH_DB_PATH || mcConfig.storagePaths.graph)
        .option('--page-size <n>', 'Chroma id fetch batch size.', value => parsePositiveInt(value, 100), 100)
        .option('--timestamp <iso>', 'Timestamp override for deterministic tests.', null)
        .option('-h, --help', 'Show help');

    program.parse(argv, {from: 'user'});

    const opts = program.opts();

    return {
        ids      : flattenIdTokens([opts.ids, ...program.args]),
        idsFile  : opts.idsFile || null,
        outputDir: opts.outputDir || null,
        graphDb  : opts.graphDb || null,
        pageSize : opts.pageSize,
        timestamp: opts.timestamp || null,
        help     : opts.help === true
    }
}

/**
 * Resolves target ids from CLI tokens and/or an ids file.
 *
 * @param {Object} options
 * @param {String[]} [options.ids=[]] Inline ids.
 * @param {String} [options.idsFile=null] Optional ids file.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @returns {Promise<String[]>}
 */
export async function resolveTargetIds({ids = [], idsFile = null, fsModule = fs} = {}) {
    const out = new Set(flattenIdTokens(ids));

    if (idsFile) {
        const fileText = await fsModule.readFile(idsFile, 'utf8');
        for (const id of parseIdsText(fileText)) {
            out.add(id);
        }
    }

    const resolved = [...out].filter(Boolean);

    if (resolved.length === 0) {
        throw new Error('No target memory ids supplied. Use --ids, --ids-file, or positional ids.');
    }

    return resolved
}

/**
 * Parses ids from JSON array/object or newline/CSV text.
 *
 * @param {String} text
 * @returns {String[]}
 */
export function parseIdsText(text) {
    const trimmed = text.trim();

    if (!trimmed) return [];

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return flattenIdTokens(parsed);
        }
        if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.ids)) {
                return flattenIdTokens(parsed.ids);
            }
            if (Array.isArray(parsed.records)) {
                return flattenIdTokens(parsed.records.map(record => record?.id));
            }
            if (Array.isArray(parsed.targets)) {
                return flattenIdTokens(parsed.targets);
            }
        }
    } catch {
        // Fall through to plain text parsing.
    }

    return flattenIdTokens(trimmed.split(/[\s,]+/))
}

/**
 * Runs the selected-record quarantine export.
 *
 * @param {Object} options
 * @param {String[]} [options.ids=[]]
 * @param {String} [options.idsFile=null]
 * @param {String} [options.outputDir=null]
 * @param {String} [options.graphDb=mcConfig.storagePaths.graph]
 * @param {Number} [options.pageSize=100]
 * @param {String} [options.timestamp=null]
 * @param {Object} [options.memoryCollection] Test seam for Chroma collection.
 * @param {Object} [options.lifecycleService=Memory_LifecycleService] Lifecycle seam.
 * @param {Object} [options.storageRouter=Memory_StorageRouter] Storage seam.
 * @param {Object} [options.logger=console]
 * @returns {Promise<Object>}
 */
export async function runExport({
    ids              = [],
    idsFile          = null,
    outputDir        = null,
    graphDb          = mcConfig.storagePaths.graph,
    pageSize         = 100,
    timestamp        = null,
    memoryCollection = null,
    lifecycleService = Memory_LifecycleService,
    storageRouter    = Memory_StorageRouter,
    logger           = console
} = {}) {
    const
        targetIds     = await resolveTargetIds({ids, idsFile}),
        generatedAt   = timestamp || new Date().toISOString(),
        fileTimestamp = toFileTimestamp(generatedAt),
        resolvedRoot  = path.resolve(outputDir || path.join(DEFAULT_QUARANTINE_ROOT, `quarantine-${fileTimestamp}`)),
        mcDir         = path.join(resolvedRoot, 'mc'),
        graphDir      = path.join(resolvedRoot, 'graph');

    await Promise.all([fs.ensureDir(mcDir), fs.ensureDir(graphDir)]);

    if (!memoryCollection) {
        await lifecycleService.ready();
        memoryCollection = await storageRouter.getMemoryCollection();
    }

    const memoryResult = await collectSelectedMemoryRecords(memoryCollection, targetIds, {pageSize});
    const memoryFile   = path.join(mcDir, `memory-backup-quarantine-${fileTimestamp}.jsonl`);
    await writeJsonl(memoryFile, memoryResult.records);

    const graphResult = await collectSelectedGraphRecords({dbPath: graphDb, ids: targetIds});
    const graphFile   = path.join(graphDir, `graph-backup-quarantine-${fileTimestamp}.jsonl`);
    await writeJsonl(graphFile, graphResult.records);

    const manifest = buildManifest({
        ids          : targetIds,
        memoryResult,
        graphResult,
        generatedAt,
        outputDir    : resolvedRoot,
        memoryFile,
        graphFile
    });

    const manifestFile = path.join(resolvedRoot, `quarantine-manifest-${fileTimestamp}.json`);
    await fs.writeJson(manifestFile, manifest, {spaces: 2});

    logger.log?.(`[exportMemoryQuarantine] wrote ${memoryResult.records.length} memory record(s), ${graphResult.records.length} graph record(s), manifest=${manifestFile}`);

    return {
        outputDir: resolvedRoot,
        files    : {memory: memoryFile, graph: graphFile, manifest: manifestFile},
        counts   : manifest.counts,
        manifest
    }
}

/**
 * Fetches exact ids from a Chroma-compatible collection.
 *
 * @param {Object} collection
 * @param {String[]} ids
 * @param {Object} [options]
 * @param {Number} [options.pageSize=100]
 * @returns {Promise<{records: Object[], missingIds: String[]}>}
 */
export async function collectSelectedMemoryRecords(collection, ids, {pageSize = 100} = {}) {
    const byId = new Map();

    for (let i = 0; i < ids.length; i += pageSize) {
        const chunk = ids.slice(i, i + pageSize);
        const page  = await collection.get({
            ids    : chunk,
            include: ['documents', 'embeddings', 'metadatas']
        });

        for (let idx = 0; idx < (page.ids || []).length; idx++) {
            byId.set(page.ids[idx], {
                id       : page.ids[idx],
                embedding: page.embeddings?.[idx] ?? null,
                metadata : page.metadatas?.[idx] ?? null,
                document : page.documents?.[idx] ?? null
            });
        }
    }

    return {
        records   : ids.map(id => byId.get(id)).filter(Boolean),
        missingIds: ids.filter(id => !byId.has(id))
    }
}

/**
 * Collects graph nodes with matching ids and directly connected edges.
 *
 * @param {Object} options
 * @param {String} options.dbPath
 * @param {String[]} options.ids
 * @param {Function} [options.DatabaseClass] Test seam.
 * @returns {Promise<{records: Object[], nodeIds: String[], edges: Object[], unavailable: Boolean, error: String|null}>}
 */
export async function collectSelectedGraphRecords({dbPath, ids, DatabaseClass = null}) {
    if (!ids.length) {
        return {records: [], nodeIds: [], edges: [], unavailable: false, error: null}
    }

    if (!dbPath || !await fs.pathExists(dbPath)) {
        return {records: [], nodeIds: [], edges: [], unavailable: true, error: dbPath ? `graph db not found: ${dbPath}` : 'graph db path not configured'}
    }

    const Database = DatabaseClass || (await import('better-sqlite3')).default;
    const db       = new Database(dbPath, {readonly: true, fileMustExist: true});

    try {
        const nodes = new Map();
        const edges = new Map();

        for (const chunk of chunkArray(ids, 200)) {
            const placeholders = chunk.map(() => '?').join(', ');
            const nodeRows = db.prepare(`SELECT id, data FROM Nodes WHERE id IN (${placeholders})`).all(...chunk);
            for (const row of nodeRows) {
                nodes.set(row.id, safeParseJson(row.data, {id: row.id}));
            }

            const edgeRows = db.prepare(`
                SELECT id, source, target, type, data
                FROM Edges
                WHERE source IN (${placeholders}) OR target IN (${placeholders})
            `).all(...chunk, ...chunk);
            for (const row of edgeRows) {
                const data = safeParseJson(row.data, {});
                edges.set(row.id, {
                    id    : data.id || row.id,
                    source: data.source || row.source,
                    target: data.target || row.target,
                    type  : data.type || row.type,
                    ...data
                });
            }
        }

        const records = [
            ...[...nodes.values()].map(data => ({type: 'node', data})),
            ...[...edges.values()].map(data => ({type: 'edge', data}))
        ];

        return {
            records,
            nodeIds    : [...nodes.keys()],
            edges      : [...edges.values()],
            unavailable: false,
            error      : null
        }
    } finally {
        db.close();
    }
}

/**
 * Builds the public-safe manifest.
 *
 * @param {Object} options
 * @returns {Object}
 */
export function buildManifest({ids, memoryResult, graphResult, generatedAt, outputDir, memoryFile, graphFile}) {
    const
        recordsById = new Map(memoryResult.records.map(record => [record.id, record])),
        graphNodeIds = new Set(graphResult.nodeIds),
        authoredByMemoryIds = new Set();

    for (const edge of graphResult.edges) {
        if (edge.type !== 'AUTHORED_BY') continue;
        if (ids.includes(edge.source)) authoredByMemoryIds.add(edge.source);
        if (ids.includes(edge.target)) authoredByMemoryIds.add(edge.target);
    }

    const entries = ids.map(id => {
        const
            record          = recordsById.get(id),
            metadata        = record?.metadata || {},
            classification  = classifyMemoryPayload(metadata),
            timestamp       = normalizeMetadataTimestamp(metadata.timestamp) || extractTimestampFromId(id),
            provenance      = classifyProvenance({metadata, id, authoredByMemoryIds});

        return {
            id,
            exported        : Boolean(record),
            candidateClass  : record ? classification.candidateClass : 'missing-from-memory-collection',
            invalidFields   : record ? classification.invalidFields : [],
            timestamp,
            month           : timestamp ? timestamp.slice(0, 7) : null,
            sessionId       : metadata.sessionId || null,
            graphMatch      : graphNodeIds.has(id),
            provenanceStatus: provenance.status,
            provenanceSources: provenance.sources
        }
    });

    const counts = {
        requested       : ids.length,
        memoryExported  : memoryResult.records.length,
        memoryMissing   : memoryResult.missingIds.length,
        graphNodes      : graphResult.nodeIds.length,
        graphEdges      : graphResult.edges.length,
        byCandidateClass: countBy(entries, 'candidateClass')
    };

    return {
        manifestVersion: 1,
        generatedAt,
        outputDir,
        files: {
            memory: memoryFile,
            graph : graphFile
        },
        safety: {
            mutationPerformed: false,
            destructiveAction: 'not-supported-by-this-script',
            publicPayloadPolicy: 'manifest omits raw prompt/thought/response; full payload exists only in local backup JSONL for rollback'
        },
        rollback: {
            mode: 'merge',
            memoryCoreImport: `Memory_DatabaseService.manageDatabaseBackup({ action: 'import', file: '${path.dirname(memoryFile)}', mode: 'merge' })`,
            graphImport     : `Memory_DatabaseService.manageDatabaseBackup({ action: 'import', file: '${path.dirname(graphFile)}', mode: 'merge' })`
        },
        graph: {
            unavailable: graphResult.unavailable,
            error      : graphResult.error
        },
        counts,
        missingIds: memoryResult.missingIds,
        entries
    }
}

/**
 * Classifies the Chroma metadata payload predicate without reading document text.
 *
 * @param {Object} metadata
 * @returns {{candidateClass: String, invalidFields: String[]}}
 */
export function classifyMemoryPayload(metadata = {}) {
    const invalidFields = PAYLOAD_FIELDS.filter(field => isBlankPayload(metadata[field]));

    if (invalidFields.length === 0) {
        return {candidateClass: 'not-corrupt-by-payload-predicate', invalidFields}
    }
    if (invalidFields.length === PAYLOAD_FIELDS.length) {
        return {candidateClass: 'all-fields-empty', invalidFields}
    }
    if (invalidFields.length === 1 && invalidFields[0] === 'prompt') {
        return {candidateClass: 'prompt-only-empty', invalidFields}
    }

    return {candidateClass: 'partial-empty', invalidFields}
}

function classifyProvenance({metadata, id, authoredByMemoryIds}) {
    const sources = [];

    if (metadata.agentIdentity) sources.push('metadata.agentIdentity');
    if (metadata.userId)        sources.push('metadata.userId');
    if (metadata.agent)         sources.push('metadata.agent');
    if (authoredByMemoryIds.has(id)) sources.push('graph.AUTHORED_BY');

    return {
        status : sources.length > 0 ? 'known' : 'unknown',
        sources
    }
}

async function writeJsonl(filePath, records) {
    await fs.ensureDir(path.dirname(filePath));

    const stream = fs.createWriteStream(filePath);
    for (const record of records) {
        stream.write(JSON.stringify(record) + '\n');
    }
    await new Promise(resolve => stream.end(resolve));
}

function flattenIdTokens(tokens) {
    return tokens
        .flatMap(token => String(token || '').split(','))
        .map(token => token.trim())
        .filter(Boolean)
}

function isBlankPayload(value) {
    return typeof value !== 'string' || value.trim().length === 0
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Expected a positive integer, got: ${value}`);
    }
    return parsed || fallback
}

function toFileTimestamp(timestamp) {
    return timestamp.replace(/:/g, '-')
}

function normalizeMetadataTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toISOString()
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.valueOf())) {
            return parsed.toISOString()
        }
    }
    return null
}

function extractTimestampFromId(id) {
    const match = /^mem_(\d{4}-\d{2}-\d{2}T[^_]+Z)$/.exec(id);
    if (!match) return null;
    const parsed = new Date(match[1]);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString()
}

function countBy(entries, key) {
    return entries.reduce((out, entry) => {
        out[entry[key]] = (out[entry[key]] || 0) + 1;
        return out
    }, {})
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks
}

function safeParseJson(text, fallback) {
    try {
        return JSON.parse(text)
    } catch {
        return fallback
    }
}

function printUsage() {
    console.log([
        'Usage: node ./ai/scripts/maintenance/exportMemoryQuarantine.mjs --ids-file <path> [--output-dir <path>]',
        '       node ./ai/scripts/maintenance/exportMemoryQuarantine.mjs --ids mem_1,mem_2',
        '',
        'This script is read-only against Memory Core. It exports selected records for quarantine/rollback and performs no deletion.'
    ].join('\n'));
}

async function main() {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            printUsage();
            return
        }

        const result = await runExport(args);
        console.log(JSON.stringify({outputDir: result.outputDir, files: result.files, counts: result.counts}, null, 2));
    } catch (error) {
        console.error(`[exportMemoryQuarantine] Fatal: ${error.message}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] === __filename) {
    main();
}
