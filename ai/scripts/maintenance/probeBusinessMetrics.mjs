/**
 * @plane host
 */
// Neo namespace bootstrap (entry-point invariant) — business-metric ingestion probe CLI.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required for any consumer of the Neo singleton API.
import Neo             from '../../../src/Neo.mjs';
import AiConfig        from '../../config.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import 'dotenv/config';
import {execFileSync}  from 'child_process';
import fsExtra         from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

import {Memory_GraphService as GraphService} from '../../services.mjs';
import {parseArgs, runProbe, runVerify}      from './businessMetricsProbeCore.mjs';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * @module ai/scripts/maintenance/probeBusinessMetrics
 *
 * @summary Entrypoint CLI (`node ai/scripts/maintenance/probeBusinessMetrics.mjs`) for the
 * read-only business-metric ingestion probe.
 *
 * Wires the real substrate into the pure core (`businessMetricsProbeCore.mjs`): the `AiConfig`
 * business leaves (read at the use site — the probe refuses to run unless
 * `business.metricProbeEnabled` is true), the Memory Core `GraphService` write/read surface,
 * local git execution for the merged-prs measurement, and the canary-manifest IO under
 * `.neo-ai-data/business-metrics/`. All decision logic lives in the core; this file is wiring
 * plus the `import.meta` main guard, so unit tests import the core substrate-free.
 *
 * Usage:
 *   probe : `node ai/scripts/maintenance/probeBusinessMetrics.mjs [--period YYYY-MM-DD] [--dry-run]`
 *   canary: `node ai/scripts/maintenance/probeBusinessMetrics.mjs --verify <manifestPath>`
 */

const MANIFEST_DIR = path.join(PROJECT_ROOT, '.neo-ai-data', 'business-metrics');

/**
 * @summary Runs git read-only inside the repo root and returns stdout.
 * @param {String[]} args git argv.
 * @returns {String}
 */
function execGit(args) {
    return execFileSync('git', args, {cwd: PROJECT_ROOT, encoding: 'utf8'});
}

/**
 * @summary Persists a probe canary manifest and returns its path.
 * @param {Object} manifest `{writtenAt, records}`
 * @returns {String}
 */
function writeManifest(manifest) {
    const stamp        = manifest.writtenAt.replace(/[:.]/g, '-');
    const manifestPath = path.join(MANIFEST_DIR, `probe-${stamp}.json`);

    fsExtra.outputJsonSync(manifestPath, manifest, {spaces: 4});

    return manifestPath;
}

async function main() {
    const args   = parseArgs(process.argv.slice(2));
    const nowIso = new Date().toISOString();

    if (args.verify) {
        const manifest = fsExtra.readJsonSync(path.resolve(args.verify));
        const result   = await runVerify({manifest}, {graphService: GraphService});

        console.log(`[probeBusinessMetrics] verify: ${result.survived.length} survived, ${result.lost.length} lost${result.lost.length ? ` — LOST: ${result.lost.join(', ')}` : ''}`);

        return result;
    }

    const result = await runProbe(args, {aiConfig: AiConfig, graphService: GraphService, execGit, writeManifest, nowIso});

    if (result.refused) {
        console.error(`[probeBusinessMetrics] refused: ${result.refused}`);
    } else if (result.errors) {
        console.error(`[probeBusinessMetrics] failed: ${result.errors.join(' · ')}`);
    } else if (result.dryRun) {
        console.log(`[probeBusinessMetrics] dry-run ${result.id}:`, JSON.stringify(result.properties, null, 4));
    } else {
        console.log(`[probeBusinessMetrics] wrote ${result.id} value=${result.value} manifest=${result.manifestPath}`);
    }

    return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(({exitCode}) => process.exit(exitCode))
        .catch(error => {
            console.error('[probeBusinessMetrics] Fatal:', error);
            process.exit(2);
        });
}
