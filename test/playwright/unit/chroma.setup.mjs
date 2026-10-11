import {test as setup}                                                 from '@playwright/test';
import os                                                              from 'node:os';
import path                                                            from 'node:path';
import {fileURLToPath}                                                 from 'node:url';
import {cleanupChromaArtifacts, ownsChromaDataDir, startChromaProcess} from '../chromaProcess.mjs';
import {resolveFreePortSync}                                           from '../resolveFreePort.mjs';

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(__dirname, '../../..');

setup.setTimeout(130000);

setup('start run-scoped Chroma for Brain unit tests', async () => {
    const
        runId       = `${process.pid}-${Date.now()}`,
        ownsDataDir = ownsChromaDataDir(),
        dataDir     = process.env.NEO_CHROMA_DATA_DIR_TEST ||
            path.join(os.tmpdir(), `neo-chroma-unit-test-${runId}`),
        host        = process.env.NEO_CHROMA_HOST_TEST || '127.0.0.1',
        port        = resolveFreePortSync(process.env.NEO_CHROMA_PORT_TEST),
        logPath     = path.join(os.tmpdir(), `neo-chroma-unit-test-${runId}.log`);

    delete process.env.NEO_UNIT_CHROMA_PID;

    Object.assign(process.env, {
        NEO_CHROMA_DATA_DIR_TEST     : dataDir,
        NEO_CHROMA_HOST_TEST         : host,
        NEO_CHROMA_PORT_TEST         : String(port),
        NEO_UNIT_CHROMA_DATA_DIR_AUTO: String(ownsDataDir),
        NEO_UNIT_CHROMA_LOG_PATH     : logPath
    });

    try {
        process.env.NEO_UNIT_CHROMA_PID = String(await startChromaProcess({
            dataDir,
            host,
            logPath,
            port,
            repoRoot
        }))
    } catch (error) {
        cleanupChromaArtifacts({dataDir, logPath, ownsDataDir});
        throw error
    }
});
