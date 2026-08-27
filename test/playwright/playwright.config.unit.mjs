import {defineConfig}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.UNIT_TEST_MODE = 'true';

/**
 * @summary Builds the Engine unit-run policy for local and CI execution.
 * @param {Object} options
 * @param {Boolean} options.isCI
 * @returns {Object}
 */
export function buildUnitRunPolicy({isCI}) {
    const reporter = [['json', {outputFile: path.join(__dirname, 'test-results/unit/test-results.json')}]];

    isCI && reporter.unshift(['github']);

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
