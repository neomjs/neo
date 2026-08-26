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

// These retained Engine/Fleet tests exercise an externally provisioned Brain runtime or import
// Brain-owned hook policy. They are not part of the Engine-only unit project after the repository
// cut. A dedicated cross-repository project will bind them to `agentosRuntimeRoot`; keeping their
// exact identities here makes the temporary boundary visible instead of letting collection fail on
// removed local `ai/**` paths.
export const crossRepoBrainTestIgnore = [
    /[\\/]harness[\\/](brain|fleetCapability)\.spec\.mjs$/,
    /[\\/]apps[\\/]agentos[\\/]config[\\/]fleetVocabularyParity\.spec\.mjs$/,
    /[\\/]apps[\\/]agentos[\\/]fleet[\\/](connectionProfiles|fleetTransport\.integration|fleetWakeStreamConsumer(?:\.live)?)\.spec\.mjs$/,
    /[\\/]apps[\\/]agentos[\\/]view[\\/]fleet[\\/](mailbox[\\/]operatorSeatConflationParity|util[\\/]kindRegistry)\.spec\.mjs$/
];

const
    isCI                     = !!process.env.CI,
    hasAgentOsRuntimeBinding = path.isAbsolute(process.env.NEO_AGENTOS_RUNTIME_ROOT || '');

export default defineConfig({
    testDir      : path.join(__dirname, 'unit'),
    outputDir    : path.join(__dirname, 'test-results/unit'),
    fullyParallel: true,
    ...buildUnitRunPolicy({isCI}),
    use     : {trace: 'on-first-retry'},
    projects: [{
        name      : 'unit-engine',
        testIgnore: hasAgentOsRuntimeBinding ? [] : crossRepoBrainTestIgnore
    }]
});
