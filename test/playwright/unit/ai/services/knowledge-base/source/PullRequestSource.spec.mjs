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
        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
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

/**
 * @summary The consumer boundary — duplicate local artifacts must never reach the Knowledge Base as
 * distinct evidence.
 *
 * Extraction walks FILES, but a chunk's name is keyed by PR IDENTITY (`pr-<id>#<element>`). Two
 * artifacts for one id emit two chunks under the SAME logical name, with different content and
 * different `source` paths — so they land as distinct rows, both retrievable, and a maintainer reads
 * one PR's two divergent renderings as two corroborating pieces of evidence. That is the failure the
 * corpus-integrity work exists to prevent, arriving through the consumer rather than the writer.
 *
 * Its own fixture root per test: the suite above shares one via `beforeAll`, and seeding duplicates
 * into a shared corpus would break the specs that assert exact chunk counts over it.
 */
test.describe('Neo.ai.services.knowledge-base.source.PullRequestSource — duplicate identity', () => {
    let PullRequestSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    const collector = () => {
        const written = [];

        return {written, write(str) { written.push(JSON.parse(str.trim())); return true }};
    };

    test.beforeAll(async () => {
        aiConfig          = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
        PullRequestSource = (await import('../../../../../../../ai/services/knowledge-base/source/PullRequestSource.mjs')).default;
    });

    test.beforeEach(() => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');

        fs.ensureDirSync(tmpDir);
        originalRoot = aiConfig.neoRootDir;
        mockRoot     = path.join(tmpDir, 'prsource-dup-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        fs.ensureDirSync(path.join(mockRoot, 'resources/content'));
        aiConfig.neoRootDir = mockRoot;
    });

    test.afterEach(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    const writePr = (relDir, id, body) => {
        const dir = path.join(mockRoot, 'resources/content', relDir);

        fs.ensureDirSync(dir);
        fs.writeFileSync(path.join(dir, `pr-${id}.md`), body, 'utf8');
    };

    const writeIndex = entries =>
        fs.writeFileSync(path.join(mockRoot, 'resources/content/_index.json'), JSON.stringify(entries));

    test('POSITIVE CONTROL: a clean corpus extracts one chunk per PR across both tiers', () => {
        // Without this, every "it threw" below could equally mean the extractor never ran at all.
        writePr('pulls/chunk-1', 100, '# body one');
        writePr('archive/pulls/v13.0.0/chunk-1', 200, '# body two');
        writeIndex([
            {type: 'pulls', id: 100, version: null, chunkNumber: 1, path: 'pulls/chunk-1/pr-100.md'},
            {type: 'pulls', id: 200, version: 'v13.0.0', chunkNumber: 1, path: 'archive/pulls/v13.0.0/chunk-1/pr-200.md'}
        ]);

        const stream = collector();

        return PullRequestSource.extract(stream, () => 'hash').then(count => {
            expect(count).toBe(2);
            expect(stream.written.map(c => c.name).sort()).toEqual(['pr-100#body', 'pr-200#body'])
        })
    });

    test('REFUSES a PR owning two artifacts — the production shape, one sealed bucket, two chunks', async () => {
        writePr('archive/pulls/v13.0.0/chunk-1', 10124, '# stale rendering');
        writePr('archive/pulls/v13.0.0/chunk-2', 10124, '# newer rendering with reviews');
        writeIndex([]);

        await expect(PullRequestSource.extract(collector(), () => 'hash'))
            .rejects.toThrow(/more than one local artifact/)
    });

    test('the refusal names BOTH artifacts — a reader must know what to repair', async () => {
        writePr('archive/pulls/v13.0.0/chunk-1', 10124, '# a');
        writePr('archive/pulls/v13.0.0/chunk-2', 10124, '# b');
        writeIndex([]);

        await expect(PullRequestSource.extract(collector(), () => 'hash'))
            .rejects.toThrow(/chunk-1[\s\S]*chunk-2|chunk-2[\s\S]*chunk-1/)
    });

    test('refuses when ONE copy is indexed and the other is not — the ids arrive typed differently', async () => {
        // The trap that would make this guard vacuous. The indexed copy's id comes from the index map
        // as a NUMBER; the unindexed copy falls back to the filename and yields a STRING. Compared
        // raw, `10124 !== '10124'` and the duplicate sails straight through — a guard that cannot see
        // the thing it guards against. This case is what pins the normalisation, and it is also the
        // most likely real shape, since an unrepaired duplicate is exactly what goes unindexed.
        writePr('archive/pulls/v13.0.0/chunk-1', 10124, '# indexed copy');
        writePr('archive/pulls/v13.0.0/chunk-2', 10124, '# unindexed copy');
        writeIndex([
            {type: 'pulls', id: 10124, version: 'v13.0.0', chunkNumber: 1, path: 'archive/pulls/v13.0.0/chunk-1/pr-10124.md'}
        ]);

        await expect(PullRequestSource.extract(collector(), () => 'hash'))
            .rejects.toThrow(/more than one local artifact/)
    });

    test('refuses across TIERS — an active and an archived copy of one PR is still one identity', async () => {
        writePr('pulls/chunk-1', 10125, '# active copy');
        writePr('archive/pulls/v13.0.0/chunk-1', 10125, '# archived copy');
        writeIndex([]);

        await expect(PullRequestSource.extract(collector(), () => 'hash'))
            .rejects.toThrow(/more than one local artifact/)
    });

    test('distinct PRs in one chunk are NOT a duplicate — the check is per identity, not per directory', () => {
        writePr('pulls/chunk-1', 300, '# three');
        writePr('pulls/chunk-1', 301, '# four');
        writeIndex([]);

        const stream = collector();

        return PullRequestSource.extract(stream, () => 'hash').then(count => {
            expect(count).toBe(2);
            expect(stream.written.map(c => c.name).sort()).toEqual(['pr-300#body', 'pr-301#body'])
        })
    });
});
