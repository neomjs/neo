import {setup} from '../../../../../setup.mjs';

const appName = 'PullRequestSourceTest';

setup({
    neoConfig: { unitTestMode: true },
    appConfig: { name: appName, isMounted: () => true, vnodeInitialising: false }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../..');

test.describe('Neo.ai.services.knowledge-base.source.PullRequestSource', () => {
    let PullRequestSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        PullRequestSource = (await import('../../../../../../../ai/services/knowledge-base/source/PullRequestSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, 'pullrequestsource-mock-' + process.pid + '-' + Date.now());

        const activeDir = path.join(mockRoot, 'resources/content/pulls/chunk-1');
        const archiveDir = path.join(mockRoot, 'resources/content/archive/pulls/v1.0.0/chunk-2');

        fs.ensureDirSync(activeDir);
        fs.ensureDirSync(archiveDir);

        fs.writeFileSync(path.join(activeDir, 'pr-1001.md'), '# First');
        fs.writeFileSync(path.join(archiveDir, 'pr-1002.md'), '# Second');

        const indexMap = [
            { type: 'pulls', id: 1001, path: 'pulls/chunk-1/pr-1001.md' },
            { type: 'pulls', id: 1002, path: 'archive/pulls/v1.0.0/chunk-2/pr-1002.md' }
        ];

        fs.writeFileSync(path.join(mockRoot, 'resources/content/pulls/_index.json'), JSON.stringify(indexMap));

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('extract() uses _index.json to resolve ID and reads both active and archive', async () => {
        const written = [];
        const writeStream = { write(str) { written.push(JSON.parse(str.trim())); return true; } };

        const count = await PullRequestSource.extract(writeStream, chunk => 'hash');

        expect(count).toBe(2);

        const ids = written.map(w => w.name).sort();
        expect(ids).toEqual(['pr-1001', 'pr-1002']);
    });
});
