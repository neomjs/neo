import {setup} from '../../../../../setup.mjs';

const appName = 'TicketSourceTest';

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

test.describe('Neo.ai.services.knowledge-base.source.TicketSource', () => {
    let TicketSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        TicketSource = (await import('../../../../../../../ai/services/knowledge-base/source/TicketSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, 'ticketsource-mock-' + process.pid + '-' + Date.now());

        const activeDir = path.join(mockRoot, 'resources/content/issues/chunk-1');
        const archiveDir = path.join(mockRoot, 'resources/content/archive/issues/v1.0.0/chunk-2');

        fs.ensureDirSync(activeDir);
        fs.ensureDirSync(archiveDir);

        fs.writeFileSync(path.join(activeDir, 'issue-1001.md'), '# First');
        fs.writeFileSync(path.join(archiveDir, 'issue-1002.md'), '# Second');

        const indexMap = [
            { type: 'issues', id: 1001, path: 'issues/chunk-1/issue-1001.md' },
            { type: 'issues', id: 1002, path: 'archive/issues/v1.0.0/chunk-2/issue-1002.md' }
        ];

        fs.writeFileSync(path.join(mockRoot, 'resources/content/issues/_index.json'), JSON.stringify(indexMap));

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('extract() uses _index.json to resolve ID and reads both active and archive', async () => {
        const written = [];
        const writeStream = { write(str) { written.push(JSON.parse(str.trim())); return true; } };

        const count = await TicketSource.extract(writeStream, chunk => 'hash');

        expect(count).toBe(2);

        const ids = written.map(w => w.name).sort();
        expect(ids).toEqual(['issue-1001', 'issue-1002']);
    });
});
