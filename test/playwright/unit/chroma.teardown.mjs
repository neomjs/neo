import {test as teardown} from '@playwright/test';
import {
    cleanupChromaArtifacts,
    readChromaLogTail,
    stopDetachedProcess
} from '../chromaProcess.mjs';

teardown.setTimeout(15000);

teardown('stop run-scoped Chroma after Brain unit tests', async () => {
    const
        dataDir     = process.env.NEO_CHROMA_DATA_DIR_TEST,
        logPath     = process.env.NEO_UNIT_CHROMA_LOG_PATH,
        ownsDataDir = process.env.NEO_UNIT_CHROMA_DATA_DIR_AUTO === 'true',
        pid         = Number(process.env.NEO_UNIT_CHROMA_PID),
        report      = await stopDetachedProcess(pid);

    if (!report.groupEmpty) {
        const tail = readChromaLogTail(logPath);

        throw new Error(`Chroma process group ${pid} survived teardown${tail ? `\nChroma log tail:\n${tail}` : ''}`)
    }

    cleanupChromaArtifacts({dataDir, logPath, ownsDataDir})
});
