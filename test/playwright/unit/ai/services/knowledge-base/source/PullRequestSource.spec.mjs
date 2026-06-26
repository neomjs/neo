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

        const activeDir  = path.join(mockRoot, 'resources/content/pulls/chunk-1');
        const archiveDir = path.join(mockRoot, 'resources/content/archive/pulls/v1.0.0/chunk-2');

        fs.ensureDirSync(activeDir);
        fs.ensureDirSync(archiveDir);

        fs.writeFileSync(path.join(activeDir, 'pr-1001.md'), '# First');
        fs.writeFileSync(path.join(archiveDir, 'pr-1002.md'), '# Second');
        fs.writeFileSync(path.join(activeDir, 'pr-1003.md'), [
            '---',
            'id: 1003',
            'title: Multi-round PR',
            '---',
            '# Multi-round PR',
            '',
            '## Test Evidence',
            '- passed',
            '',
            '## Comments',
            '',
            '### `@neo-gpt` commented on 2026-06-25T18:54:58Z',
            '',
            'A comment.',
            '',
            '## Reviews',
            '',
            '### `@tobiu` (APPROVED) reviewed on 2026-06-25T21:02:56Z',
            '',
            'Approved.'
        ].join('\n'));

        const indexMap = [
            { type: 'pulls', id: 1001, path: 'pulls/chunk-1/pr-1001.md' },
            { type: 'pulls', id: 1002, path: 'archive/pulls/v1.0.0/chunk-2/pr-1002.md' },
            { type: 'pulls', id: 1003, path: 'pulls/chunk-1/pr-1003.md' }
        ];

        fs.writeFileSync(path.join(mockRoot, 'resources/content/pulls/_index.json'), JSON.stringify(indexMap));

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('extract() uses _index.json to resolve ID and reads both active and archive', async () => {
        const written     = [];
        const writeStream = { write(str) { written.push(JSON.parse(str.trim())); return true; } };

        const count = await PullRequestSource.extract(writeStream, chunk => 'hash');

        // 2 no-discussion PRs (one body chunk each) + pr-1003 (body + 1 comment + 1 review) = 5.
        expect(count).toBe(5);

        const ids = written.map(w => w.name).sort();
        expect(ids).toEqual([
            'pr-1001#body',
            'pr-1002#body',
            'pr-1003#body',
            'pr-1003#comment-1',
            'pr-1003#review-1'
        ]);
    });

    test('extract() splits a multi-round PR into body + per-review/comment elements (#14067)', async () => {
        const written     = [];
        const writeStream = { write(str) { written.push(JSON.parse(str.trim())); return true; } };

        await PullRequestSource.extract(writeStream, chunk => 'hash');

        const body    = written.find(c => c.name === 'pr-1003#body');
        const comment = written.find(c => c.name === 'pr-1003#comment-1');
        const review  = written.find(c => c.name === 'pr-1003#review-1');

        expect(body.content).toContain('## Test Evidence');
        expect(body.content).toContain('## Comments');
        expect(body.content).not.toContain('A comment.');
        expect(comment.content).toContain('@neo-gpt');
        expect(comment.content).toContain('A comment.');
        expect(comment.content).not.toContain('Approved.');
        expect(review.content).toContain('@tobiu');
        expect(review.content).toContain('Approved.');

        for (const c of [body, comment, review]) {
            expect(c.type).toBe('pull');
            expect(c.source).toContain('pr-1003.md');
        }
    });
});
