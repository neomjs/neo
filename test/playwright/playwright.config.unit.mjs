import {defineConfig}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default defineConfig({
    testDir      : path.join(__dirname, 'unit'),
    outputDir    : path.join(__dirname, 'test-results/unit'),
    fullyParallel: true,
    forbidOnly   : !!process.env.CI,
    retries      : process.env.CI ? 2 : 0,
    workers      : process.env.CI ? 1 : undefined,
    reporter     : [['json', {outputFile: path.join(__dirname, 'test-results/unit/test-results.json')}]],
    use          : {trace: 'on-first-retry'}
});
