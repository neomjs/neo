/**
 * @plane in-plane
 */
import 'dotenv/config';
import {Command}       from 'commander';
import path            from 'path';
import {fileURLToPath} from 'url';

import {
    Memory_GraphService as GraphService,
    Memory_LifecycleService
} from '../../services.mjs';

/**
 * @summary On-demand Memory/Session graph lifecycle report (storage-growth observability).
 *
 * Thin operator entrypoint over {@link GraphService#getLifecycleCensus}. This lives in a script —
 * NOT the healthcheck payload and NOT an MCP tool — because the optional incident-edge count is an
 * `O(edges)` scan that grows linearly with the graph (multi-second at millions of edges), and because
 * an MCP-tool response schema would load into every agent's context unconditionally. Run it when an
 * operator wants a census; nothing pays the cost otherwise. Node counts + file sizes are cheap;
 * `--edges` opts into the slow incident-edge scan.
 *
 * @module ai/scripts/maintenance/graphLifecycleReport
 */

/**
 * @summary Build the Commander parser for the report runner.
 * @param {Object} env Environment source.
 * @returns {Command}
 */
function createArgParser(env = process.env) {
    const program = new Command();

    program
        .name('ai:graph-lifecycle-report')
        .description('On-demand Memory/Session graph lifecycle census (storage-growth observability).')
        .exitOverride()
        .configureOutput({writeErr: () => {}, writeOut: () => {}})
        .helpOption(false)
        .allowExcessArguments(false)
        .option('--edges', 'Include the O(edges) incident-edge counts (slow at scale).', false)
        .option('--json', 'Emit the raw census JSON only.', false)
        .option('-h, --help', 'Show help');

    return program;
}

/**
 * @summary Parse CLI argv for the report runner.
 * @param {String[]} argv CLI argv slice.
 * @param {Object} env Environment source.
 * @returns {Object}
 */
export function parseArgs(argv, env = process.env) {
    const program = createArgParser(env);

    program.parse(argv, {from: 'user'});

    const options = program.opts(),
          args    = {includeIncidentEdges: options.edges === true, json: options.json === true};

    if (options.help) args.help = true;

    return args;
}

/**
 * @summary Format a census payload as a human-readable report.
 * @param {Object} census The {@link GraphService#getLifecycleCensus} payload.
 * @returns {String}
 */
export function formatCensus(census) {
    if (!census.available) {
        return `[graphLifecycleReport] graph storage unavailable: ${census.error || 'unknown'}`;
    }

    const mib   = bytes => (bytes / (1024 * 1024)).toFixed(2),
          lines = [
              `[graphLifecycleReport] measured ${census.measuredAt}`,
              `  MEMORY nodes  : ${census.memoryNodes}`,
              `  SESSION nodes : ${census.sessionNodes}`,
              `  SQLite main   : ${mib(census.sqliteBytes)} MiB`,
              `  SQLite WAL    : ${mib(census.sqliteWalBytes)} MiB`,
              `  SQLite SHM    : ${mib(census.sqliteShmBytes)} MiB`
          ];

    if (census.memoryIncidentEdges !== undefined) {
        lines.push(`  MEMORY incident edges  : ${census.memoryIncidentEdges}`);
        lines.push(`  SESSION incident edges : ${census.sessionIncidentEdges}`);
    } else {
        lines.push('  (incident-edge counts omitted — rerun with --edges for the O(edges) scan)');
    }

    return lines.join('\n');
}

/**
 * @summary Run the report against live Memory Core services and print it.
 * @param {Object} options
 * @param {Object} [options.graphService] GraphService singleton or test double.
 * @param {Object} [options.lifecycle] LifecycleService used to await readiness.
 * @param {Boolean} [options.includeIncidentEdges=false] Run the O(edges) incident-edge scan.
 * @param {Boolean} [options.json=false] Emit raw JSON instead of the formatted report.
 * @param {Object} [options.logger=console] Output sink.
 * @returns {Promise<Object>} The census payload.
 */
export async function runReport({
    graphService         = GraphService,
    lifecycle            = Memory_LifecycleService,
    includeIncidentEdges = false,
    json                 = false,
    logger               = console
} = {}) {
    await lifecycle.ready();
    await graphService.ready();

    const census = await graphService.getLifecycleCensus({includeIncidentEdges});

    logger.log(json ? JSON.stringify(census, null, 2) : formatCensus(census));

    return census;
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

    const census = await runReport(args);

    return {exitCode: census.available ? 0 : 1};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(({exitCode}) => process.exit(exitCode))
        .catch(error => {
            console.error('[graphLifecycleReport] Fatal:', error);
            process.exit(2);
        });
}
