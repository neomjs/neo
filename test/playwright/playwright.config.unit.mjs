import {defineConfig}  from '@playwright/test';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.UNIT_TEST_MODE = 'true';

const chromaTestHost    = process.env.NEO_CHROMA_HOST_TEST || '127.0.0.1';
const chromaTestPort    = Number(process.env.NEO_CHROMA_PORT_TEST) || 18180;
const chromaTestDataDir = process.env.NEO_CHROMA_DATA_DIR_TEST ||
    path.join(os.tmpdir(), `neo-chroma-unit-test-${process.pid}`);

process.env.NEO_CHROMA_HOST_TEST     = chromaTestHost;
process.env.NEO_CHROMA_PORT_TEST     = String(chromaTestPort);
process.env.NEO_CHROMA_DATA_DIR_TEST = chromaTestDataDir;

export default defineConfig({
    testDir      : path.join(__dirname, 'unit'),
    outputDir    : path.join(__dirname, 'test-results/unit'),
    fullyParallel: true,
    forbidOnly   : !!process.env.CI,
    retries      : process.env.CI ? 2 : 0,
    workers      : process.env.CI ? 1 : undefined,
    reporter     : [['json', {outputFile: path.join(__dirname, 'test-results/unit/test-results.json')}]],
    use          : {trace: 'on-first-retry'},
    webServer    : {
        command            : `chroma run --path "${chromaTestDataDir}" --host ${chromaTestHost} --port ${chromaTestPort}`,
        url                : `http://${chromaTestHost}:${chromaTestPort}/api/v2/heartbeat`,
        timeout            : 120000,
        reuseExistingServer: false,
        stdout             : 'pipe',
        stderr             : 'pipe',
        gracefulShutdown   : {
            signal : 'SIGTERM',
            timeout: 30000
        }
    }
});
