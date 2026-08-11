/**
 * @plane in-plane
 */
import {Command}       from 'commander';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';
import {
    SEMANTIC_SPINE_NODE_TYPE_SET,
    chooseCanonicalConceptId,
    getConceptAliasKeys,
    normalizeConceptKey
} from '../../services/graph/conceptSpineCanonicalization.mjs';

export {normalizeConceptKey};

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'learn', 'agentos', 'measurements');

const SEMANTIC_NODE_LABELS = SEMANTIC_SPINE_NODE_TYPE_SET;
const SEMANTIC_ID_PREFIXES = /^(CONCEPT|CLASS|PROCESS):/i;

/**
 * @summary Parses the concept-spine alias audit CLI arguments.
 * @param {String[]} argv CLI argv slice.
 * @param {Object} [env=process.env] Environment source.
 * @returns {Object}
 */
export function parseArgs(argv, env = process.env) {
    const program = new Command();

    program
        .name('ai:audit-concept-spine-aliases')
        .description('Run the read-only concept-spine alias-cluster detection pass.')
        .exitOverride()
        .configureOutput({
            writeErr: () => {},
            writeOut: () => {}
        })
        .helpOption(false)
        .allowExcessArguments(false)
        .option('--graph-db <path>', 'Memory Core graph SQLite path.', env.NEO_MEMORY_GRAPH_DB_PATH || null)
        .option('--output-dir <path>', 'Directory for the markdown measurement artifact.', env.CONCEPT_SPINE_ALIAS_AUDIT_DIR || DEFAULT_OUTPUT_DIR)
        .option('--timestamp <iso>', 'Timestamp override for deterministic output.', null)
        .option('--top <n>', 'Top cluster count to render.', value => parsePositiveInt(value, 25), 25)
        .option('--json', 'Print the JSON report to stdout instead of writing markdown.', false)
        .option('-h, --help', 'Show help');

    program.parse(argv, {from: 'user'});

    const opts = program.opts();

    return {
        graphDb  : opts.graphDb || null,
        outputDir: opts.outputDir,
        timestamp: opts.timestamp || null,
        top      : opts.top,
        json     : opts.json === true,
        help     : opts.help === true
    };
}

/**
 * @summary Extracts graph node records from SQLite `Nodes` rows.
 * @param {Object[]} rows SQLite rows with `{id, data}`.
 * @returns {Object[]}
 */
export function parseNodeRows(rows = []) {
    return rows.map(row => {
        const data       = parseJsonObject(row.data),
              properties = data.properties || {};

        return {
            id         : row.id || data.id,
            label      : data.label || row.label || 'NODE',
            name       : properties.name || data.name || row.id || data.id,
            description: properties.description || '',
            aliases    : Array.isArray(properties.aliases) ? properties.aliases : Array.isArray(data.aliases) ? data.aliases : [],
            properties
        };
    }).filter(node => typeof node.id === 'string' && node.id.length > 0);
}

/**
 * @summary Extracts graph edge records from SQLite `Edges` rows.
 * @param {Object[]} rows SQLite rows with `{id, source, target, type, data}`.
 * @returns {Object[]}
 */
export function parseEdgeRows(rows = []) {
    return rows.map(row => {
        const data       = parseJsonObject(row.data),
              properties = data.properties || {};

        return {
            id    : row.id || data.id,
            source: row.source || data.source,
            target: row.target || data.target,
            type  : row.type || data.type || 'RELATED_TO',
            properties
        };
    }).filter(edge => typeof edge.id === 'string' && typeof edge.source === 'string' && typeof edge.target === 'string');
}

/**
 * @summary Builds the read-only alias-cluster report from parsed graph nodes and edges.
 * @param {Object} options
 * @param {Object[]} options.nodes Parsed node records.
 * @param {Object[]} options.edges Parsed edge records.
 * @param {String} [options.generatedAt] ISO timestamp.
 * @param {String} [options.graphDb] Source DB path.
 * @returns {Object}
 */
export function createConceptSpineAliasReport({
    nodes       = [],
    edges       = [],
    generatedAt = new Date().toISOString(),
    graphDb     = null
} = {}) {
    const
        semanticNodes = nodes.filter(isSemanticSpineNode),
        uf            = new UnionFind(),
        nodesById     = new Map(semanticNodes.map(node => [node.id, node])),
        nodeKeys      = new Map(),
        keyNodes      = new Map();

    for (const node of semanticNodes) {
        const keys = getConceptAliasKeys(node);
        if (keys.length === 0) continue;

        nodeKeys.set(node.id, keys);
        for (const key of keys) {
            uf.add(key);
            if (!keyNodes.has(key)) keyNodes.set(key, new Set());
            keyNodes.get(key).add(node.id);
        }
        for (const key of keys.slice(1)) {
            uf.union(keys[0], key);
        }
    }

    const groups = new Map();
    for (const [key, nodeIds] of keyNodes) {
        const root = uf.find(key);
        if (!groups.has(root)) {
            groups.set(root, {keys: new Set(), nodeIds: new Set()});
        }
        const group = groups.get(root);
        group.keys.add(key);
        for (const nodeId of nodeIds) {
            group.nodeIds.add(nodeId);
        }
    }

    const clusters = [...groups.values()]
        .map(group => buildCluster(group, nodesById, nodeKeys, edges))
        .filter(cluster => cluster.nodeCount > 1)
        .sort(compareClusters);

    const sizeDistribution = {};
    for (const cluster of clusters) {
        sizeDistribution[cluster.nodeCount] = (sizeDistribution[cluster.nodeCount] || 0) + 1;
    }

    const clusteredNodeIds = new Set();
    for (const cluster of clusters) {
        for (const nodeId of cluster.nodeIds) {
            clusteredNodeIds.add(nodeId);
        }
    }

    return {
        generatedAt,
        graphDb,
        scope: {
            nodeLabels     : [...SEMANTIC_NODE_LABELS],
            idPrefixes     : ['CONCEPT:', 'CLASS:', 'PROCESS:'],
            detectionPolicy: 'strip semantic prefix, camel-split, case-fold, kebabize id/name/aliases; union keys per node'
        },
        summary: {
            semanticNodeCount : semanticNodes.length,
            edgeCount         : edges.length,
            aliasClusterCount : clusters.length,
            clusteredNodeCount: clusteredNodeIds.size,
            largestClusterSize: clusters[0]?.nodeCount || 0,
            sizeDistribution
        },
        knownProbeClusters: findKnownProbeClusters(clusters),
        clusters
    };
}

/**
 * @summary Renders the alias-cluster report as the committed measurement artifact.
 * @param {Object} report Alias-cluster report.
 * @param {Object} [options]
 * @param {Number} [options.top=25] Top cluster count to render.
 * @returns {String}
 */
export function renderMarkdownReport(report, {top = 25} = {}) {
    const lines = [
        `# Concept Spine Alias Cluster Report - ${report.generatedAt.slice(0, 10)}`,
        '',
        `Generated: ${report.generatedAt}`,
        `Source DB: ${report.graphDb || '(injected test data)'}`,
        '',
        'Detection only: this artifact performs no graph writes and does not choose canonical merges.',
        '',
        '## Summary',
        '',
        `- Semantic nodes scanned: ${report.summary.semanticNodeCount}`,
        `- Graph edges scanned: ${report.summary.edgeCount}`,
        `- Alias clusters found: ${report.summary.aliasClusterCount}`,
        `- Semantic nodes inside clusters: ${report.summary.clusteredNodeCount}`,
        `- Largest cluster size: ${report.summary.largestClusterSize}`,
        `- Size distribution: ${formatDistribution(report.summary.sizeDistribution)}`,
        '',
        '## Known Probe Clusters',
        ''
    ];

    if (report.knownProbeClusters.length === 0) {
        lines.push('- None found.');
    } else {
        for (const cluster of report.knownProbeClusters) {
            lines.push(`- ${cluster.probe}: ${cluster.nodeCount} nodes, ${cluster.neighborhood.disjointNeighborCount} disjoint neighbor signatures, canonical candidate \`${cluster.canonicalCandidate}\``);
            lines.push(`  - Nodes: ${formatCodeList(cluster.nodeIds)}`);
        }
    }

    lines.push('', `## Top ${Math.min(top, report.clusters.length)} Clusters`, '');
    lines.push('| Rank | Canonical candidate | Nodes | Keys | Edge signatures | Disjoint signatures |');
    lines.push('|---:|---|---:|---:|---:|---:|');

    report.clusters.slice(0, top).forEach((cluster, index) => {
        lines.push(`| ${index + 1} | \`${cluster.canonicalCandidate}\` | ${cluster.nodeCount} | ${cluster.keys.length} | ${cluster.neighborhood.totalNeighborSignatures} | ${cluster.neighborhood.disjointNeighborCount} |`);
    });

    lines.push('', '## Cluster Details', '');

    report.clusters.slice(0, top).forEach((cluster, index) => {
        lines.push(`### ${index + 1}. \`${cluster.canonicalCandidate}\``);
        lines.push('');
        lines.push(`- Node count: ${cluster.nodeCount}`);
        lines.push(`- Key count: ${cluster.keys.length}`);
        lines.push(`- Neighbor signatures: ${cluster.neighborhood.totalNeighborSignatures}`);
        lines.push(`- Shared signatures: ${cluster.neighborhood.sharedNeighborCount}`);
        lines.push(`- Disjoint signatures: ${cluster.neighborhood.disjointNeighborCount}`);
        lines.push(`- Nodes: ${formatCodeList(cluster.nodeIds)}`);
        lines.push(`- Keys: ${formatCodeList(cluster.keys)}`);
        lines.push('');
    });

    return lines.join('\n').trim() + '\n';
}

/**
 * @summary Runs the audit against supplied records or a live SQLite DB.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function runAudit({
    graphDb   = null,
    outputDir = DEFAULT_OUTPUT_DIR,
    timestamp = null,
    top       = 25,
    json      = false,
    logger    = console
} = {}) {
    const source         = graphDb || await getDefaultGraphDbPath();
    const {nodes, edges} = await readSqliteGraph(source);
    const report         = createConceptSpineAliasReport({
        nodes,
        edges,
        generatedAt: timestamp || new Date().toISOString(),
        graphDb    : source
    });

    if (json) {
        logger.log(JSON.stringify(report, null, 2));
        return {report, reportPath: null, exitCode: 0};
    }

    await fs.ensureDir(outputDir);
    const reportPath = path.join(outputDir, `concept-spine-alias-clusters-${report.generatedAt.slice(0, 10)}.md`);
    await fs.writeFile(reportPath, renderMarkdownReport(report, {top}), 'utf8');
    logger.log(`[auditConceptSpineAliases] Wrote ${reportPath}`);
    logger.log(`[auditConceptSpineAliases] ${JSON.stringify(report.summary)}`);

    return {report, reportPath, exitCode: 0};
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonObject(value) {
    if (!value || typeof value !== 'string') return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function isSemanticSpineNode(node) {
    return SEMANTIC_NODE_LABELS.has(node.label) || SEMANTIC_ID_PREFIXES.test(node.id);
}

function buildCluster(group, nodesById, nodeKeys, edges) {
    const
        nodeIds      = [...group.nodeIds].sort(),
        nodes        = nodeIds.map(id => nodesById.get(id)).filter(Boolean),
        keys         = [...group.keys].sort(),
        keySet       = new Set(keys),
        canonical    = chooseCanonicalConceptId(nodeIds, keySet),
        neighborhood = summarizeNeighborhood(nodeIds, edges);

    return {
        canonicalCandidate: canonical,
        nodeCount         : nodes.length,
        nodeIds,
        keys,
        nodes             : nodes.map(node => ({
            id   : node.id,
            label: node.label,
            name : node.name,
            keys : nodeKeys.get(node.id) || []
        })),
        neighborhood
    };
}

function summarizeNeighborhood(nodeIds, edges) {
    const
        nodeSet    = new Set(nodeIds),
        signatures = new Map(),
        edgeCounts = Object.fromEntries(nodeIds.map(id => [id, 0]));

    for (const edge of edges) {
        const sourceIn = nodeSet.has(edge.source),
              targetIn = nodeSet.has(edge.target);

        if (!sourceIn && !targetIn) continue;

        if (sourceIn) {
            edgeCounts[edge.source]++;
            addSignature(signatures, edge.source, `out:${edge.type}:${edge.target}`);
        }
        if (targetIn) {
            edgeCounts[edge.target]++;
            addSignature(signatures, edge.target, `in:${edge.type}:${edge.source}`);
        }
    }

    let sharedNeighborCount   = 0;
    let disjointNeighborCount = 0;
    for (const nodeIdsForSignature of signatures.values()) {
        if (nodeIdsForSignature.size > 1) sharedNeighborCount++;
        else disjointNeighborCount++;
    }

    return {
        totalNeighborSignatures: signatures.size,
        sharedNeighborCount,
        disjointNeighborCount,
        edgeCounts
    };
}

function addSignature(signatures, nodeId, signature) {
    if (!signatures.has(signature)) {
        signatures.set(signature, new Set());
    }
    signatures.get(signature).add(nodeId);
}

function findKnownProbeClusters(clusters) {
    const probes = [
        {probe: 'Golden Path', pattern: /golden-path|goldenpath|golden path/i},
        {probe: 'Dream Pipeline', pattern: /dream-pipeline|dreampipeline|dream pipeline/i}
    ];

    const hits = [];
    for (const probe of probes) {
        const cluster = clusters.find(item =>
            item.nodeIds.some(id => probe.pattern.test(id)) ||
            item.keys.some(key => probe.pattern.test(key))
        );
        if (cluster) {
            hits.push({probe: probe.probe, ...cluster});
        }
    }

    return hits;
}

function compareClusters(a, b) {
    return b.nodeCount - a.nodeCount ||
           b.neighborhood.disjointNeighborCount - a.neighborhood.disjointNeighborCount ||
           b.keys.length - a.keys.length ||
           a.canonicalCandidate.localeCompare(b.canonicalCandidate);
}

function formatDistribution(distribution) {
    const entries = Object.entries(distribution).sort((a, b) => Number(a[0]) - Number(b[0]));
    return entries.length === 0 ? '(none)' : entries.map(([size, count]) => `${size}:${count}`).join(', ');
}

function formatCodeList(values = [], limit = 20) {
    const shown = values.slice(0, limit).map(value => `\`${value}\``).join(', ');
    const extra = values.length > limit ? `, ... +${values.length - limit}` : '';
    return shown + extra;
}

async function getDefaultGraphDbPath() {
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');
    const config = (await import('../../mcp/server/memory-core/config.mjs')).default;
    return config.storagePaths.graph;
}

async function readSqliteGraph(graphDb) {
    const {default: Database} = await import('better-sqlite3');
    const db                  = new Database(graphDb, {readonly: true});

    try {
        const nodeRows = db.prepare('SELECT id, data FROM Nodes').all();
        const edgeRows = db.prepare('SELECT id, source, target, type, data FROM Edges').all();

        return {
            nodes: parseNodeRows(nodeRows),
            edges: parseEdgeRows(edgeRows)
        };
    } finally {
        db.close();
    }
}

class UnionFind {
    parent = new Map()

    add(value) {
        if (!this.parent.has(value)) {
            this.parent.set(value, value);
        }
    }

    find(value) {
        this.add(value);

        const parent = this.parent.get(value);
        if (parent === value) return value;

        const root = this.find(parent);
        this.parent.set(value, root);
        return root;
    }

    union(a, b) {
        const rootA = this.find(a),
              rootB = this.find(b);

        if (rootA !== rootB) {
            this.parent.set(rootB, rootA);
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log('Usage: node ai/scripts/maintenance/auditConceptSpineAliases.mjs [--graph-db path] [--output-dir path] [--timestamp iso] [--top n] [--json]');
        return {exitCode: 0};
    }

    return runAudit(args);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(({exitCode}) => process.exit(exitCode))
        .catch(error => {
            console.error('[auditConceptSpineAliases] Fatal:', error);
            process.exit(1);
        });
}
