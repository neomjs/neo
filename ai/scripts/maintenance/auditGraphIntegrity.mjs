/**
 * @plane in-plane
 */
import 'dotenv/config';
import {Command}       from 'commander';
import fsExtra         from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

import {
    Memory_GraphService as GraphService,
    Memory_LifecycleService,
    Memory_StorageRouter as StorageRouter
} from '../../services.mjs';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const DEFAULT_AUDIT_ROOT = path.join(PROJECT_ROOT, '.neo-ai-data', 'audits');

const SEVERITY_RANK = {
    clean: 0,
    soft : 1,
    hard : 2
};

/**
 * @summary Creates the Commander parser for the graph-integrity audit runner.
 *
 * The default threshold treats any non-zero divergence up to 5% as
 * `soft`; divergence above 5% is `hard`. Operators can override it via
 * `--hard-threshold` or `GRAPH_INTEGRITY_HARD_THRESHOLD`.
 *
 * @param {Object} env Environment source.
 * @returns {Command}
 */
function createArgParser(env = process.env) {
    const program = new Command();

    program
        .name('ai:audit-integrity')
        .description('Run the read-only Memory Core graph-integrity audit.')
        .exitOverride()
        .configureOutput({
            writeErr: () => {},
            writeOut: () => {}
        })
        .helpOption(false)
        .allowExcessArguments(false)
        .option('--output-dir <path>', 'Report directory.', env.GRAPH_INTEGRITY_AUDIT_DIR || DEFAULT_AUDIT_ROOT)
        .option(
            '--page-size <n>',
            'Chroma pagination size.',
            value => parsePositiveInt(value, 1000),
            parsePositiveInt(env.GRAPH_INTEGRITY_PAGE_SIZE, 1000)
        )
        .option(
            '--hard-threshold <ratio>',
            'Hard severity threshold ratio.',
            value => parseRatio(value, 0.05),
            parseRatio(env.GRAPH_INTEGRITY_HARD_THRESHOLD, 0.05)
        )
        .option('-h, --help', 'Show help');

    return program;
}

/**
 * @summary Parse CLI arguments for the graph-integrity audit runner.
 * @param {String[]} argv CLI argv slice.
 * @param {Object} env Environment source.
 * @returns {Object}
 */
export function parseArgs(argv, env = process.env) {
    const program = createArgParser(env);

    program.parse(argv, {from: 'user'});

    const options = program.opts();

    const args = {
        outputDir    : options.outputDir,
        pageSize     : options.pageSize,
        hardThreshold: options.hardThreshold
    };

    if (options.help) args.help = true;

    return args;
}

/**
 * @summary Group raw Memory Core Chroma rows by logical `sessionId`.
 *
 * @param {Object} collection Chroma-compatible memory collection.
 * @param {Object} options
 * @param {Number} options.pageSize Chroma pagination size.
 * @returns {Promise<Map<String, Object>>}
 */
export async function collectMemorySessionCounts(collection, {pageSize = 1000} = {}) {
    const counts = new Map();
    let offset   = 0;

    while (true) {
        const page = await collection.get({
            include: ['metadatas'],
            limit  : pageSize,
            offset
        });

        const ids = page?.ids || [];
        if (ids.length === 0) break;

        for (let i = 0; i < ids.length; i++) {
            const
                meta      = page.metadatas?.[i] || {},
                sessionId = meta.sessionId;

            if (!sessionId) continue;

            const current = counts.get(sessionId) || {
                sessionId,
                expectedMemoryCount: 0,
                userId             : meta.userId || null
            };

            current.expectedMemoryCount++;
            if (!current.userId && meta.userId) current.userId = meta.userId;
            counts.set(sessionId, current);
        }

        if (ids.length < pageSize) break;
        offset += ids.length;
    }

    return counts;
}

/**
 * @summary Map Chroma summary rows by logical `sessionId`.
 *
 * @param {Object} collection Chroma-compatible summary collection.
 * @param {Object} options
 * @param {Number} options.pageSize Chroma pagination size.
 * @returns {Promise<Map<String, Object>>}
 */
export async function collectSummarySessions(collection, {pageSize = 1000} = {}) {
    const sessions = new Map();
    let offset     = 0;

    while (true) {
        const page = await collection.get({
            include: ['metadatas'],
            limit  : pageSize,
            offset
        });

        const ids = page?.ids || [];
        if (ids.length === 0) break;

        for (let i = 0; i < ids.length; i++) {
            const
                meta      = page.metadatas?.[i] || {},
                sessionId = meta.sessionId;

            if (!sessionId) continue;

            sessions.set(sessionId, {
                sessionId,
                chromaSessionId: ids[i],
                title          : meta.title || null,
                userId         : meta.userId || null
            });
        }

        if (ids.length < pageSize) break;
        offset += ids.length;
    }

    return sessions;
}

/**
 * @summary List SESSION graph nodes directly from the Memory Core graph store.
 *
 * This observation-only runner uses a direct SQLite read that mirrors the
 * graph observability helpers without adding a public service method before
 * the report contract has empirical mileage.
 *
 * @param {Object} graphService Memory GraphService singleton or test double.
 * @returns {Map<String, Object>}
 */
export function listGraphSessions(graphService) {
    const sqliteDb = graphService?.db?.storage?.db;
    const sessions = new Map();

    if (!sqliteDb) return sessions;

    const rows = sqliteDb.prepare(`
        SELECT id, data FROM Nodes
        WHERE json_extract(data, '$.label') = 'SESSION'
    `).all();

    for (const row of rows) {
        const
            data      = JSON.parse(row.data),
            sessionId = data.properties?.sessionId || stripSessionPrefix(row.id);

        if (!sessionId) continue;

        sessions.set(sessionId, {
            sessionId,
            sessionNodeId: row.id,
            userId       : data.properties?.userId || null
        });
    }

    return sessions;
}

/**
 * @summary Create the graph-integrity report and exit-code contract.
 *
 * @param {Object} options
 * @param {Map<String, Object>} options.memorySessionCounts Raw Chroma memory counts by session.
 * @param {Map<String, Object>} options.summarySessions Chroma summary rows by session.
 * @param {Map<String, Object>} options.graphSessions Graph SESSION nodes by session.
 * @param {Function} options.getActualMemoryCount Returns graph `ORIGINATES_IN` count for a session.
 * @param {Function} options.getEntityRelationCount Optional full entity-relation count.
 * @param {String} options.generatedAt ISO timestamp.
 * @param {Number} options.hardThreshold Hard threshold ratio.
 * @returns {Object}
 */
export function createGraphIntegrityReport({
    memorySessionCounts,
    summarySessions,
    graphSessions,
    getActualMemoryCount,
    getEntityRelationCount = null,
    generatedAt    = new Date().toISOString(),
    hardThreshold  = 0.05
}) {
    const sessionIds = new Set([
        ...memorySessionCounts.keys(),
        ...summarySessions.keys(),
        ...graphSessions.keys()
    ]);

    const entries = [...sessionIds].sort().map(sessionId => {
        const
            memory       = memorySessionCounts.get(sessionId) || {},
            summary      = summarySessions.get(sessionId) || {},
            graph        = graphSessions.get(sessionId) || {},
            expected     = memory.expectedMemoryCount || 0,
            actual       = Number(getActualMemoryCount(sessionId) || 0),
            entityCount  = typeof getEntityRelationCount === 'function'
                ? Number(getEntityRelationCount(sessionId) || 0)
                : null,
            divergence   = expected - actual,
            severity     = classifyDivergence({expected, actual, hardThreshold});

        return {
            sessionId,
            sessionNodeId       : graph.sessionNodeId || `session:${sessionId}`,
            chromaSessionId     : summary.chromaSessionId || null,
            expectedMemoryCount : expected,
            actualMemoryCount   : actual,
            entityRelationCount : entityCount,
            divergence,
            divergenceRatio     : calculateDivergenceRatio(expected, actual),
            severity,
            graphSessionPresent : graphSessions.has(sessionId),
            chromaMemoryPresent : memorySessionCounts.has(sessionId),
            chromaSummaryPresent: summarySessions.has(sessionId),
            userId              : graph.userId || memory.userId || summary.userId || null
        };
    });

    const summary = summarizeEntries(entries);

    return {
        generatedAt,
        thresholds: {
            hardDivergenceRatio: hardThreshold
        },
        summary,
        entries,
        exitCode: summary.exitCode
    };
}

/**
 * @summary Run the audit against live Memory Core services and write the report.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function runAudit({
    graphService  = GraphService,
    storageRouter = StorageRouter,
    lifecycle     = Memory_LifecycleService,
    fsModule      = fsExtra,
    outputDir     = DEFAULT_AUDIT_ROOT,
    pageSize      = 1000,
    hardThreshold = 0.05,
    logger        = console
} = {}) {
    await lifecycle.ready();
    await graphService.ready();

    const [memoryCollection, summaryCollection] = await Promise.all([
        storageRouter.getMemoryCollection(),
        storageRouter.getSummaryCollection()
    ]);

    const [memorySessionCounts, summarySessions] = await Promise.all([
        collectMemorySessionCounts(memoryCollection, {pageSize}),
        collectSummarySessions(summaryCollection, {pageSize})
    ]);

    const graphSessions = listGraphSessions(graphService);

    const report = createGraphIntegrityReport({
        memorySessionCounts,
        summarySessions,
        graphSessions,
        getActualMemoryCount  : sessionId => countGraphOriginatesInEdges(graphService, sessionId),
        getEntityRelationCount: sessionId => graphService.getSessionEntityCount(sessionId),
        hardThreshold
    });

    const reportPath = await writeReport(report, {fsModule, outputDir});
    logger.log(`[auditGraphIntegrity] Wrote ${reportPath}`);
    logger.log(`[auditGraphIntegrity] ${JSON.stringify(report.summary)}`);

    return {report, reportPath, exitCode: report.exitCode};
}

/**
 * @summary Persist the report as timestamped JSON under `.neo-ai-data/audits/`.
 * @param {Object} report Report object.
 * @param {Object} options
 * @returns {Promise<String>} Absolute report path.
 */
export async function writeReport(report, {
    fsModule  = fsExtra,
    outputDir = DEFAULT_AUDIT_ROOT
} = {}) {
    await fsModule.ensureDir(outputDir);

    const
        safeTimestamp = report.generatedAt.replace(/:/g, '-'),
        reportPath    = path.join(outputDir, `graph-integrity-${safeTimestamp}.json`);

    await fsModule.writeJson(reportPath, report, {spaces: 2});
    return reportPath;
}

/**
 * @summary Count graph `ORIGINATES_IN` memory edges targeting one session.
 *
 * This is intentionally narrower than `GraphService.getSessionEntityCount()`,
 * which counts every inbound entity relation to the session. The
 * `actualMemoryCount` contract compares raw Chroma memory rows with graph
 * `ORIGINATES_IN(Memory -> Session)` edges, so the edge-type filter is part
 * of the audit contract.
 *
 * @param {Object} graphService Memory GraphService singleton or test double.
 * @param {String} sessionId Logical session ID, with or without `session:` prefix.
 * @returns {Number}
 */
export function countGraphOriginatesInEdges(graphService, sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return 0;

    const sqliteDb = graphService?.db?.storage?.db;
    if (!sqliteDb) return 0;

    const
        normalizedId = normalizeSessionNodeId(graphService, sessionId),
        stmt         = sqliteDb.prepare(`
            SELECT count(*) as count FROM Edges
            WHERE target = ?
              AND type = 'ORIGINATES_IN'
        `);

    return Number(stmt.get(normalizedId)?.count || 0);
}

/**
 * @summary Classify a session-level divergence.
 * @param {Object} options
 * @returns {String}
 */
export function classifyDivergence({expected, actual, hardThreshold = 0.05}) {
    const divergence = Math.abs(expected - actual);

    if (divergence === 0) return 'clean';
    if (calculateDivergenceRatio(expected, actual) <= hardThreshold) return 'soft';
    return 'hard';
}

function calculateDivergenceRatio(expected, actual) {
    const divergence = Math.abs(expected - actual);
    if (divergence === 0) return 0;
    return expected > 0 ? divergence / expected : 1;
}

function summarizeEntries(entries) {
    const summary = {
        totalSessions       : entries.length,
        clean               : 0,
        soft                : 0,
        hard                : 0,
        graphMissing        : 0,
        chromaMemoryMissing : 0,
        chromaSummaryMissing: 0,
        worstSeverity       : 'clean',
        exitCode            : 0
    };

    for (const entry of entries) {
        summary[entry.severity]++;
        if (!entry.graphSessionPresent) summary.graphMissing++;
        if (!entry.chromaMemoryPresent) summary.chromaMemoryMissing++;
        if (!entry.chromaSummaryPresent) summary.chromaSummaryMissing++;

        if (SEVERITY_RANK[entry.severity] > SEVERITY_RANK[summary.worstSeverity]) {
            summary.worstSeverity = entry.severity;
        }
    }

    summary.exitCode = SEVERITY_RANK[summary.worstSeverity];
    return summary;
}

function parsePositiveInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRatio(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stripSessionPrefix(id) {
    return typeof id === 'string' ? id.replace(/^session:/i, '') : null;
}

function normalizeSessionNodeId(graphService, sessionId) {
    const prefixed = /^(session|memory):/i.test(sessionId)
        ? sessionId
        : `session:${sessionId}`;

    return typeof graphService?.normalizeGraphNodeId === 'function'
        ? graphService.normalizeGraphNodeId(prefixed)
        : prefixed.toLowerCase();
}

function printHelp() {
    console.log(createArgParser().helpInformation().trimEnd());
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return {exitCode: 0};
    }

    return runAudit(args);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(({exitCode}) => process.exit(exitCode))
        .catch(error => {
            console.error('[auditGraphIntegrity] Fatal:', error);
            process.exit(2);
        });
}
