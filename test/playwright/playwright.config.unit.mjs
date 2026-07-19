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
        testIgnore: brainTestMatch
    }, {
        name        : 'unit-brain',
        dependencies: ['chroma-setup'],
        testMatch   : brainTestMatch
    }]
});
