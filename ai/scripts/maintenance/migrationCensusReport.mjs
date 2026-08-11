/**
 * @plane in-plane
 */
import 'dotenv/config';
import {Command}       from 'commander';
import path            from 'path';
import {fileURLToPath} from 'url';

import {
    Memory_GraphService as GraphService,
    Memory_HealthService as HealthService,
    Memory_LifecycleService
} from '../../services.mjs';

/**
 * @summary On-demand Memory Core migration census (multi-tenant userId-tagging debt).
 *
 * Thin operator entrypoint over {@link HealthService#getMigrationCensus}. This lives in a script —
 * NOT the healthcheck payload and NOT an MCP tool — because the ChromaDB-side count batch-scans the
 * full memory + summary collections (`O(records)`, multi-second at scale), and because an MCP-tool
 * response schema would load into every agent's context unconditionally. Run it when an operator
 * wants the census; nothing pays the scan cost otherwise. The cheap SQLite graph counts are always
 * included; `--chroma` opts into the slow ChromaDB metadata scan.
 *
 * @module ai/scripts/maintenance/migrationCensusReport
 */

/**
 * @summary Build the Commander parser for the census runner.
 * @returns {Command}
 */
function createArgParser() {
    const program = new Command();

    program
        .name('ai:migration-census-report')
        .description('On-demand Memory Core migration census (multi-tenant userId-tagging debt).')
        .exitOverride()
        .configureOutput({writeErr: () => {}, writeOut: () => {}})
        .helpOption(false)
        .allowExcessArguments(false)
        .option('--chroma', 'Include the O(records) ChromaDB metadata scan (slow at scale).', false)
        .option('--json', 'Emit the raw census JSON only.', false)
        .option('-h, --help', 'Show help');

    return program;
}

/**
 * @summary Parse CLI argv for the census runner.
 * @param {String[]} argv CLI argv slice.
 * @returns {Object}
 */
export function parseArgs(argv) {
    const program = createArgParser();

    program.parse(argv, {from: 'user'});

    const options = program.opts(),
          args    = {includeChroma: options.chroma === true, json: options.json === true};

    if (options.help) args.help = true;

    return args;
}

/**
 * @summary Format a migration census payload as a human-readable report.
 * @param {Object} census The {@link HealthService#getMigrationCensus} payload.
 * @returns {String}
 */
export function formatCensus(census) {
    const g     = census.graph || {},
          lines = [`[migrationCensusReport] measured ${census.measuredAt}`];

    if (g.available === false) {
        lines.push(`  SQLite graph: unavailable${g.error ? ` (${g.error})` : ''}`);
    } else {
        lines.push(`  SQLite untagged MEMORY  : ${g.memory}`);
        lines.push(`  SQLite untagged SESSION : ${g.session}`);
        lines.push(`  SQLite untagged total   : ${g.total}`);
    }

    if (census.chromadb) {
        const c = census.chromadb;
        if (c.available === false) {
            lines.push(`  ChromaDB: unavailable${c.error ? ` (${c.error})` : ''}`);
        } else {
            lines.push(`  Chroma migration-debt total : ${c.total} (untagged ${c.untagged?.total ?? 0})`);
        }
    } else {
        lines.push('  (Chroma scan omitted — rerun with --chroma for the O(records) scan)');
    }

    return lines.join('\n');
}

/**
 * @summary Run the census against live Memory Core services and print it.
 * @param {Object} options
 * @param {Object} [options.healthService] HealthService singleton or test double.
 * @param {Object} [options.graphService] GraphService singleton (mounts the SQLite graph) or double.
 * @param {Object} [options.lifecycle] LifecycleService used to await readiness.
 * @param {Boolean} [options.includeChroma=false] Run the O(records) ChromaDB metadata scan.
 * @param {Boolean} [options.json=false] Emit raw JSON instead of the formatted report.
 * @param {Object} [options.logger=console] Output sink.
 * @returns {Promise<Object>} The census payload.
 */
export async function runReport({
    healthService = HealthService,
    graphService  = GraphService,
    lifecycle     = Memory_LifecycleService,
    includeChroma = false,
    json          = false,
    logger        = console
} = {}) {
    await lifecycle.ready();
    await graphService.ready();

    const census = await healthService.getMigrationCensus({includeChroma});

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

    return {exitCode: census.graph?.available ? 0 : 1};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(({exitCode}) => process.exit(exitCode))
        .catch(error => {
            console.error('[migrationCensusReport] Fatal:', error);
            process.exit(2);
        });
}
