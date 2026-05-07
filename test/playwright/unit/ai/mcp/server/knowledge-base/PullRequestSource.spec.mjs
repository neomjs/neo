import {setup} from '../../../../../setup.mjs';

const appName = 'PullRequestSourceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
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

test.describe('Neo.ai.mcp.server.knowledge-base.source.PullRequestSource', () => {
    let PullRequestSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig          = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        PullRequestSource = (await import('../../../../../../../ai/mcp/server/knowledge-base/source/PullRequestSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, `pullrequest-source-mock-${process.pid}-${Date.now()}`);

        const pullsDir = path.join(mockRoot, 'resources/content/pulls');
        fs.ensureDirSync(pullsDir);
        fs.writeFileSync(path.join(pullsDir, 'pr-0001.md'), '# First PR\nbody A');
        fs.writeFileSync(path.join(pullsDir, 'pr-0002.md'), '# Second PR\nbody B');
        fs.writeFileSync(path.join(pullsDir, 'notes.txt'), 'should be ignored — non-md');

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('is a Neo.setupClass singleton with the expected className and extract() method', () => {
        expect(PullRequestSource, 'default export must resolve').toBeDefined();
        expect(PullRequestSource.className).toBe('Neo.ai.mcp.server.knowledge-base.source.PullRequestSource');
        expect(typeof PullRequestSource.extract).toBe('function');
    });

    test('extract() emits one chunk per .md file with type: "pull" and correct metadata', async () => {
        const written = [];
        const writeStream = {
            write(chunkStr) {
                written.push(JSON.parse(chunkStr.trim()));
                return true;
            }
        };
        const createHashFn = chunk => 'hash:' + chunk.name;

        const count = await PullRequestSource.extract(writeStream, createHashFn);

        expect(count).toBe(2);
        expect(written).toHaveLength(2);

        const [first, second] = written;

        expect(first).toMatchObject({
            type   : 'pull',
            kind   : 'pull',
            name   : 'pr-0001',
            content: '# First PR\nbody A',
            hash   : 'hash:pr-0001'
        });
        expect(first.source).toBe(path.join('resources/content/pulls/pr-0001.md'));

        expect(second).toMatchObject({
            type   : 'pull',
            kind   : 'pull',
            name   : 'pr-0002',
            content: '# Second PR\nbody B',
            hash   : 'hash:pr-0002'
        });
    });

    test('extract() ignores non-.md files in the pulls directory', async () => {
        const written = [];
        const writeStream = {
            write(chunkStr) {
                written.push(JSON.parse(chunkStr.trim()));
                return true;
            }
        };

        await PullRequestSource.extract(writeStream, chunk => chunk.name);

        expect(written.map(w => w.name)).not.toContain('notes');
    });

    test('extract() returns 0 and writes nothing when the pulls directory is absent', async () => {
        const missingRoot = path.join(mockRoot, 'does-not-exist');
        aiConfig.neoRootDir = missingRoot;
        try {
            const written = [];
            const writeStream = {
                write(chunkStr) { written.push(chunkStr); return true; }
            };

            const count = await PullRequestSource.extract(writeStream, () => 'h');

            expect(count).toBe(0);
            expect(written).toHaveLength(0);
        } finally {
            aiConfig.neoRootDir = mockRoot;
        }
    });

    test('PullRequestSource is registered in DatabaseService sources array', () => {
        const dbServicePath = path.join(repoRoot, 'ai/mcp/server/knowledge-base/services/DatabaseService.mjs');

        expect(fs.existsSync(dbServicePath), `DatabaseService.mjs not found at ${dbServicePath}`).toBe(true);

        const content = fs.readFileSync(dbServicePath, 'utf8');

        expect(content, 'PullRequestSource must be imported').toMatch(/import\s+PullRequestSource\s+from\s+'\.\.\/source\/PullRequestSource\.mjs'/);

        const arrayMatch = content.match(/const\s+sources\s*=\s*\[([\s\S]*?)\]/m);
        expect(arrayMatch, 'sources array block not found in DatabaseService.mjs').not.toBeNull();
        expect(arrayMatch[1], 'PullRequestSource must appear in the sources array').toMatch(/\bPullRequestSource\b/);
    });
});
