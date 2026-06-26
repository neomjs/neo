import {setup} from '../../../../../setup.mjs';

const appName = 'DiscussionSourceTest';

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

test.describe('Neo.ai.services.knowledge-base.source.DiscussionSource', () => {
    let DiscussionSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        DiscussionSource = (await import('../../../../../../../ai/services/knowledge-base/source/DiscussionSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, 'discussionsource-mock-' + process.pid + '-' + Date.now());

        const activeDir  = path.join(mockRoot, 'resources/content/discussions/chunk-1');
        const archiveDir = path.join(mockRoot, 'resources/content/archive/discussions/v1.0.0/chunk-2');

        fs.ensureDirSync(activeDir);
        fs.ensureDirSync(archiveDir);

        fs.writeFileSync(path.join(activeDir, 'discussion-1001.md'), '# First');
        fs.writeFileSync(path.join(archiveDir, 'discussion-1002.md'), '# Second');
        fs.writeFileSync(path.join(activeDir, 'discussion-1003.md'), [
            '---',
            'id: 1003',
            'title: Converged discussion',
            '---',
            '# Converged discussion',
            '',
            '## Converged Model',
            'The agreed shape.',
            '',
            '## Comments',
            '',
            '### `@neo-gpt` commented on 2026-06-20T05:13:58Z',
            '',
            'First reply.',
            '',
            '### `@neo-opus-ada` commented on 2026-06-20T05:22:13Z',
            '',
            'Second reply.'
        ].join('\n'));

        const indexMap = [
            { type: 'discussions', id: 1001, path: 'discussions/chunk-1/discussion-1001.md' },
            { type: 'discussions', id: 1002, path: 'archive/discussions/v1.0.0/chunk-2/discussion-1002.md' },
            { type: 'discussions', id: 1003, path: 'discussions/chunk-1/discussion-1003.md' }
        ];

        fs.writeFileSync(path.join(mockRoot, 'resources/content/discussions/_index.json'), JSON.stringify(indexMap));

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('extract() uses _index.json to resolve ID and reads both active and archive', async () => {
        const written     = [];
        const writeStream = { write(str) { written.push(JSON.parse(str.trim())); return true; } };

        const count = await DiscussionSource.extract(writeStream, chunk => 'hash');

        // 2 no-comment discussions (one body chunk each) + discussion-1003 (body + 2 comments) = 5.
        expect(count).toBe(5);

        const ids = written.map(w => w.name).sort();
        expect(ids).toEqual([
            'discussion-1001#body',
            'discussion-1002#body',
            'discussion-1003#body',
            'discussion-1003#comment-1',
            'discussion-1003#comment-2'
        ]);
    });

    test('extract() splits a converged discussion into body + per-comment elements (#14070)', async () => {
        const written     = [];
        const writeStream = { write(str) { written.push(JSON.parse(str.trim())); return true; } };

        await DiscussionSource.extract(writeStream, chunk => 'hash');

        const body     = written.find(c => c.name === 'discussion-1003#body');
        const comment1 = written.find(c => c.name === 'discussion-1003#comment-1');
        const comment2 = written.find(c => c.name === 'discussion-1003#comment-2');

        expect(body.content).toContain('## Converged Model');
        expect(body.content).not.toContain('First reply.');
        expect(comment1.content).toContain('@neo-gpt');
        expect(comment1.content).toContain('First reply.');
        expect(comment1.content).not.toContain('Second reply.');
        expect(comment2.content).toContain('@neo-opus-ada');
        expect(comment2.content).toContain('Second reply.');

        for (const c of [body, comment1, comment2]) {
            expect(c.type).toBe('discussion');
            expect(c.source).toContain('discussion-1003.md');
        }
    });
});
