/**
 * @plane in-plane
 */
// Neo namespace bootstrap (entry-point invariant) — community-activity shadow probe CLI.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required before loading a Neo singleton service.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import fsExtra         from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

import GraphqlService                                  from '../../services/github-workflow/GraphqlService.mjs';
import {makeCommunityActivityShadowReader}             from '../../services/github-workflow/communityActivityShadowReader.mjs';
import {classifyAuthorTrust}                           from '../../services/shared/contentTrust/authorTrustClassifier.mjs';
import {formatHumanSummary, parseArgs, runShadowProbe} from './communityActivityShadowProbeCore.mjs';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const REPORT_DIR   = path.join(PROJECT_ROOT, '.neo-ai-data', 'community-activity-shadow');

/**
 * @module ai/scripts/maintenance/probeCommunityActivityShadow
 *
 * @summary Thin, read-only GitHub wiring for the community-activity shadow measurement.
 *
 * The sibling pure core owns arguments, report construction, aggregation, classification,
 * repeatability, and the human summary. This entrypoint binds only GitHub's authenticated read
 * transports, the canonical author-trust classifier, the clock, and ignored local report IO.
 * It never imports a syncer, Memory Core, Task, checkpoint, wake, policy, or graph-write surface.
 *
 * Usage:
 *   `npm run ai:probe-community-activity-shadow -- --owner neomjs --repo neo \
 *       --window-start 2026-06-18T00:00:00Z --window-end 2026-07-18T00:00:00Z \
 *       --page-size 100 --runs 2`
 */

/**
 * @summary Resolves the report path from an explicit CLI path or an ignored timestamped default.
 * @param {String|null|undefined} requestedPath Optional path supplied through `--output`.
 * @param {String} completedAt ISO timestamp naming the default report artifact.
 * @returns {String}
 */
function resolveReportPath(requestedPath, completedAt) {
    if (requestedPath) {
        return path.resolve(PROJECT_ROOT, requestedPath)
    }

    const stamp = completedAt.replace(/[:.]/g, '-');

    return path.join(REPORT_DIR, `report-${stamp}.json`)
}

/**
 * @summary Persists one JSON-first shadow report under the explicit or ignored-local path.
 * @param {Object} report Versioned community-activity shadow report.
 * @param {String|null|undefined} requestedPath Optional CLI output path.
 * @returns {String} Absolute report path.
 */
function writeReport(report, requestedPath) {
    const completedAt = report?.run?.completedAt || report?.generatedAt || new Date().toISOString();
    const reportPath  = resolveReportPath(requestedPath, completedAt);

    fsExtra.outputJsonSync(reportPath, report, {spaces: 4});

    return reportPath
}

/**
 * @summary Runs the read-only shadow acquisition and writes its evidence artifact.
 * @param {String[]} argv CLI arguments.
 * @returns {Promise<Object>} Exit code plus the report and report path when acquisition runs.
 */
export async function main(argv=process.argv.slice(2)) {
    const args = parseArgs(argv);

    if (args.helpText) {
        console.log(args.helpText);

        return {exitCode: 0}
    }

    const reader = makeCommunityActivityShadowReader({
        query: GraphqlService.query.bind(GraphqlService),
        rest : GraphqlService.rest.bind(GraphqlService),
        now  : () => Date.now()
    });
    const result = await runShadowProbe(args, {
        classifyTrust: classifyAuthorTrust,
        now          : () => new Date().toISOString(),
        reader
    });

    if (!result.report) {
        return result
    }

    const reportPath = writeReport(result.report, args.output);

    console.log(formatHumanSummary(result.report));
    console.log(`[probeCommunityActivityShadow] report: ${reportPath}`);

    return {...result, reportPath}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main()
        .then(({exitCode=0}) => {
            process.exitCode = exitCode;
        })
        .catch(error => {
            console.error('[probeCommunityActivityShadow] Fatal:', error);
            process.exitCode = 2;
        });
}
