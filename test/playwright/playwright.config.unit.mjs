import './configTemplateResolver.mjs';

import {defineConfig}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.UNIT_TEST_MODE = 'true';

// Brain specs retain the Chroma capability by default. Body-focused runs do not select this
// project, so Playwright omits its setup dependency entirely instead of booting Chroma before it
// knows what the command selected. The structural boundary is deliberately conservative: a Brain
// test may freely exercise Memory Core / KB transitively without maintaining a fragile filename
// allow-list, while every non-Brain spec remains a genuinely pure Node.js unit run.
export const brainTestMatch = /[\\/]ai[\\/].*\.spec\.mjs$/;

// Profiling specs assert wall-clock performance budgets, which only mean anything on an UNCONTENDED
// CPU. Under multi-worker parallelism the shallow-clone filter has measured ~750ms against its 400ms
// budget — inside the old deep-clone band — so a bulk-parallel run cannot host them. They run in
// their own project instead (see `unit-profiling` below), so the bulk suites can go wide while these
// stay quiet. Keep this list narrow: only genuine wall-clock-budget specs belong here — a spec whose
// timing assertion is a ratio or a loose timeout does NOT (it survives contention and should
// parallelize with the bulk).
export const profilingTestMatch = /[\\/]devindex[\\/](StoreFilter|GridScroll)Profile\.spec\.mjs$/;

export default defineConfig({
    testDir      : path.join(__dirname, 'unit'),
    outputDir    : path.join(__dirname, 'test-results/unit'),
    fullyParallel: true,
    forbidOnly   : !!process.env.CI,
    retries      : process.env.CI ? 2 : 0,
    workers      : process.env.CI ? 1 : undefined,
    reporter     : [['json', {outputFile: path.join(__dirname, 'test-results/unit/test-results.json')}]],
    use          : {trace: 'on-first-retry'},
    projects     : [{
        name     : 'chroma-setup',
        testMatch: /chroma\.setup\.mjs$/,
        teardown : 'chroma-teardown'
    }, {
        name     : 'chroma-teardown',
        testMatch: /chroma\.teardown\.mjs$/
    }, {
        name      : 'unit',
        testIgnore: [brainTestMatch, profilingTestMatch]
    }, {
        name        : 'unit-brain',
        dependencies: ['chroma-setup'],
        testMatch   : brainTestMatch
    }, {
        // Isolation is TWO mechanisms, because neither alone suffices:
        //   1. `dependencies: ['unit']` is the BARRIER — this project does not START until the bulk
        //      body suite finishes, so the multi-worker contention that busts the budgets is already
        //      over. A project-level `workers` cap would NOT achieve this on its own: independent
        //      projects interleave up to the global worker maximum.
        //   2. `workers: 1` is the cross-file serializer — `fullyParallel: false` alone only
        //      serializes WITHIN a file, so the two profiling specs (separate files) would still run
        //      concurrent and contend with each other. `workers: 1` (a valid TestProject field in the
        //      pinned Playwright) caps this project to one worker while the global stays wide for the
        //      bulk-parallelism win. Each profiling spec then measures truly alone.
        // Depends on `unit` only, not `unit-brain`: the profiling specs are pure body runs, and
        // dragging the brain project (hence a Chroma boot) into a body-only invocation would break
        // the config's pure-body-run boundary for a measurement that never touches the Brain.
        name         : 'unit-profiling',
        dependencies : ['unit'],
        testMatch    : profilingTestMatch,
        fullyParallel: false,
        workers      : 1
    }]
});
