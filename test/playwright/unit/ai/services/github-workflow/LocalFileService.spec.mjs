import {setup} from '../../../../setup.mjs';

const appName = 'LocalFileServiceTest';

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
import os              from 'os';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

test.describe.serial('Neo.ai.services.github-workflow.LocalFileService — index-backed read-path (ADR 0004 / #11390)', () => {
    let LocalFileService;
    let aiConfig;
    let originalIssuesDir, originalArchiveRoot, originalDiscussionsDir, originalContentRoot;
    let testRoot;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;

        // Capture original paths
        originalIssuesDir      = aiConfig.issueSync.issuesDir;
        originalArchiveRoot    = aiConfig.issueSync.archiveRoot;
        originalDiscussionsDir = aiConfig.issueSync.discussionsDir;
        originalContentRoot    = aiConfig.issueSync.contentRoot;

        // Create isolated test root
        testRoot = path.join(os.tmpdir(), `neo-localfileservice-test-${Date.now()}`);
        aiConfig.issueSync.issuesDir      = path.join(testRoot, 'issues');
        aiConfig.issueSync.archiveRoot    = path.join(testRoot, 'archive');
        aiConfig.issueSync.discussionsDir = path.join(testRoot, 'discussions');
        aiConfig.issueSync.contentRoot    = testRoot;

        await fs.ensureDir(aiConfig.issueSync.issuesDir);
        await fs.ensureDir(aiConfig.issueSync.archiveRoot);
        await fs.ensureDir(aiConfig.issueSync.discussionsDir);

        LocalFileService = (await import('../../../../../../ai/services/github-workflow/LocalFileService.mjs')).default;
    });

    test.afterAll(async () => {
        aiConfig.issueSync.issuesDir      = originalIssuesDir;
        aiConfig.issueSync.archiveRoot    = originalArchiveRoot;
        aiConfig.issueSync.discussionsDir = originalDiscussionsDir;
        aiConfig.issueSync.contentRoot    = originalContentRoot;

        await fs.remove(testRoot).catch(() => {});
    });

    test.afterEach(async () => {
        // Clean each test's fixture state
        await fs.emptyDir(aiConfig.issueSync.issuesDir).catch(() => {});
        await fs.emptyDir(aiConfig.issueSync.archiveRoot).catch(() => {});
        await fs.emptyDir(aiConfig.issueSync.discussionsDir).catch(() => {});
        await fs.remove(path.join(testRoot, '_index.json')).catch(() => {});
    });

    test('getIssueById finds active issue via _index.json', async () => {
        const issueId = '11100';
        const filename = `issue-${issueId}.md`;
        const activePath = path.join(aiConfig.issueSync.issuesDir, 'chunk-1', filename);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, '# Active issue content');
        await writeIndex([{type: 'issues', id: Number(issueId), version: null, chunkNumber: 1, path: path.join('issues', 'chunk-1', filename)}]);

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Active issue content');
        expect(result.filePath).toBe(activePath);
    });

    test('getIssueById finds archived issue via _index.json', async () => {
        const issueId = '9999';
        const filename = `issue-${issueId}.md`;
        const archivePath = path.join(aiConfig.issueSync.archiveRoot, 'issues', 'v12.0.0', 'chunk-1', filename);
        await fs.ensureDir(path.dirname(archivePath));
        await fs.writeFile(archivePath, '# Archived (new path) content');
        await writeIndex([{
            type: 'issues', id: Number(issueId), version: 'v12.0.0', chunkNumber: 1,
            path: path.join('archive', 'issues', 'v12.0.0', 'chunk-1', filename)
        }]);

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Archived (new path) content');
        expect(result.filePath).toBe(archivePath);
    });

    test('getIssueById does not probe retired legacy paths without an index entry', async () => {
        const issueId = '8888';
        const filename = `issue-${issueId}.md`;
        const legacyPath = path.join(testRoot, 'issue-archive', 'v11.0.0', '88xx', filename);
        await fs.ensureDir(path.dirname(legacyPath));
        await fs.writeFile(legacyPath, '# Archived (legacy path) content');

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.code).toBe('NOT_FOUND');
        expect(result.error).toBe('File not found');
    });

    test('getIssueById returns NOT_FOUND when index entry is missing', async () => {
        await writeIndex([]);

        const result = await LocalFileService.getIssueById('77777');

        expect(result.code).toBe('NOT_FOUND');
        expect(result.error).toBe('File not found');
    });

    test('getIssueById returns STALE_INDEX when indexed file is missing', async () => {
        const issueId = '6666';
        const filename = `issue-${issueId}.md`;
        await writeIndex([{type: 'issues', id: Number(issueId), version: null, chunkNumber: 1, path: path.join('issues', 'chunk-1', filename)}]);

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.code).toBe('STALE_INDEX');
        expect(result.error).toBe('Stale content index');
    });

    test('getDiscussionById finds active discussion via _index.json', async () => {
        const discussionId = '11240';
        const filename = `discussion-${discussionId}.md`;
        const activePath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', filename);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, '# Active discussion');
        await writeIndex([{
            type: 'discussions', id: Number(discussionId), version: null, chunkNumber: 1,
            path: path.join('discussions', 'chunk-1', filename)
        }]);

        const result = await LocalFileService.getDiscussionById(discussionId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Active discussion');
        expect(result.filePath).toBe(activePath);
    });

    test('getDiscussionById finds archived discussion via _index.json', async () => {
        const discussionId = '8500';
        const filename = `discussion-${discussionId}.md`;
        const archivePath = path.join(aiConfig.issueSync.archiveRoot, 'discussions', 'v12.0.0', 'chunk-1', filename);
        await fs.ensureDir(path.dirname(archivePath));
        await fs.writeFile(archivePath, '# Archived discussion');
        await writeIndex([{
            type: 'discussions', id: Number(discussionId), version: 'v12.0.0', chunkNumber: 1,
            path: path.join('archive', 'discussions', 'v12.0.0', 'chunk-1', filename)
        }]);

        const result = await LocalFileService.getDiscussionById(discussionId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Archived discussion');
        expect(result.filePath).toBe(archivePath);
    });

    test('getDiscussionById returns NOT_FOUND when index entry is missing', async () => {
        await writeIndex([]);

        const result = await LocalFileService.getDiscussionById('99999');

        expect(result.code).toBe('NOT_FOUND');
        expect(result.error).toBe('File not found');
    });

    test('getIssueById accepts leading # in issue number', async () => {
        const issueId = '5555';
        const filename = `issue-${issueId}.md`;
        const activePath = path.join(aiConfig.issueSync.issuesDir, 'chunk-1', filename);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, '# Issue with hash prefix');
        await writeIndex([{type: 'issues', id: Number(issueId), version: null, chunkNumber: 1, path: path.join('issues', 'chunk-1', filename)}]);

        const result = await LocalFileService.getIssueById(`#${issueId}`);

        expect(result.content).toBe('# Issue with hash prefix');
    });

    async function writeIndex(entries) {
        await fs.writeJson(path.join(testRoot, '_index.json'), entries, {spaces: 2});
    }
});
