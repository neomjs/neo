import {defineConfig}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.UNIT_TEST_MODE = 'true';

/**
 * @summary Builds the Engine unit-run policy for local and CI execution.
 * @description In CI three reporters compose, each for a different reader: `github` writes the inline
 * annotations a reviewer reads on a red run, `list` writes one line per test — the `✓` pass marks the
 * defect ledger's producer reads from a green run's log to observe a unit test recover, which a dot
 * progress line cannot name — and `json` writes the report the failure-only artifact carries. Locally
 * the report alone is kept; the runner's own terminal output is the developer's reader.
 * @param {Object} options
 * @param {Boolean} options.isCI
 * @returns {Object}
 */
export function buildUnitRunPolicy({isCI}) {
    const reporter = [['json', {outputFile: path.join(__dirname, 'test-results/unit/test-results.json')}]];

    isCI && reporter.unshift(['github'], ['list']);

    return {
        failOnFlakyTests: isCI,
        forbidOnly      : isCI,
        reporter,
        retries         : isCI ? 2 : 0,
        workers         : isCI ? 4 : undefined
    }
}

const isCI = !!process.env.CI;

export default defineConfig({
    testDir      : path.join(__dirname, 'unit'),
    outputDir    : path.join(__dirname, 'test-results/unit'),
    fullyParallel: true,
    ...buildUnitRunPolicy({isCI}),
    use     : {trace: 'on-first-retry'},
    projects: [{
        name: 'unit-engine'
    }]
});
