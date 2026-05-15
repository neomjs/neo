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

test.describe.serial('Neo.ai.services.github-workflow.LocalFileService — dual-search read-path (#11285 / Epic #11187 B2)', () => {
    let LocalFileService;
    let aiConfig;
    let originalIssuesDir, originalArchiveRoot, originalDiscussionsDir;
    let testRoot;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;

        // Capture original paths
        originalIssuesDir      = aiConfig.issueSync.issuesDir;
        originalArchiveRoot    = aiConfig.issueSync.archiveRoot;
        originalDiscussionsDir = aiConfig.issueSync.discussionsDir;

        // Create isolated test root
        testRoot = path.join(os.tmpdir(), `neo-localfileservice-test-${Date.now()}`);
        aiConfig.issueSync.issuesDir      = path.join(testRoot, 'issues');
        aiConfig.issueSync.archiveRoot    = path.join(testRoot, 'archive');
        aiConfig.issueSync.discussionsDir = path.join(testRoot, 'discussions');

        await fs.ensureDir(aiConfig.issueSync.issuesDir);
        await fs.ensureDir(aiConfig.issueSync.archiveRoot);
        await fs.ensureDir(aiConfig.issueSync.discussionsDir);

        LocalFileService = (await import('../../../../../../ai/services/github-workflow/LocalFileService.mjs')).default;
    });

    test.afterAll(async () => {
        aiConfig.issueSync.issuesDir      = originalIssuesDir;
        aiConfig.issueSync.archiveRoot    = originalArchiveRoot;
        aiConfig.issueSync.discussionsDir = originalDiscussionsDir;

        await fs.remove(testRoot).catch(() => {});
    });

    test.afterEach(async () => {
        // Clean each test's fixture state
        await fs.emptyDir(aiConfig.issueSync.issuesDir).catch(() => {});
        await fs.emptyDir(aiConfig.issueSync.archiveRoot).catch(() => {});
        await fs.emptyDir(aiConfig.issueSync.discussionsDir).catch(() => {});
    });

    test('getIssueById finds active issue via chunkPath shape', async () => {
        const issueId = '11100';
        const filename = `issue-${issueId}.md`;
        const activePath = path.join(aiConfig.issueSync.issuesDir, '111xx', filename);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, '# Active issue content');

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Active issue content');
        expect(result.filePath).toBe(activePath);
    });

    test('getIssueById falls back to new archiveRoot when not in active', async () => {
        const issueId = '9999';
        const filename = `issue-${issueId}.md`;
        const archivePath = path.join(aiConfig.issueSync.archiveRoot, 'issues', 'v12.0.0', filename);
        await fs.ensureDir(path.dirname(archivePath));
        await fs.writeFile(archivePath, '# Archived (new path) content');

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Archived (new path) content');
        expect(result.filePath).toBe(archivePath);
    });

    test('getIssueById does not probe retired legacy issue-archive paths', async () => {
        const issueId = '8888';
        const filename = `issue-${issueId}.md`;
        const legacyPath = path.join(testRoot, 'issue-archive', 'v11.0.0', '88xx', filename);
        await fs.ensureDir(path.dirname(legacyPath));
        await fs.writeFile(legacyPath, '# Archived (legacy path) content');

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.code).toBe('NOT_FOUND');
        expect(result.error).toBe('File not found');
    });

    test('getIssueById returns NOT_FOUND when issue exists nowhere', async () => {
        const result = await LocalFileService.getIssueById('77777');

        expect(result.code).toBe('NOT_FOUND');
        expect(result.error).toBe('File not found');
    });

    test('getIssueById returns archiveRoot matches without consulting retired legacy paths', async () => {
        const issueId = '6666';
        const filename = `issue-${issueId}.md`;
        const newPath = path.join(aiConfig.issueSync.archiveRoot, 'issues', 'v12.0.0', filename);
        const legacyPath = path.join(testRoot, 'issue-archive', 'v11.0.0', '66xx', filename);
        await fs.ensureDir(path.dirname(newPath));
        await fs.ensureDir(path.dirname(legacyPath));
        await fs.writeFile(newPath, '# New canonical wins');
        await fs.writeFile(legacyPath, '# Legacy should not be returned');

        const result = await LocalFileService.getIssueById(issueId);

        expect(result.content).toBe('# New canonical wins');
        expect(result.filePath).toBe(newPath);
    });

    test('getDiscussionById finds active flat discussion (post-B1 canonical shape)', async () => {
        const discussionId = '11240';
        const filename = `discussion-${discussionId}.md`;
        const flatPath = path.join(aiConfig.issueSync.discussionsDir, filename);
        await fs.writeFile(flatPath, '# Active flat discussion');

        const result = await LocalFileService.getDiscussionById(discussionId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Active flat discussion');
        expect(result.filePath).toBe(flatPath);
    });

    test('getDiscussionById falls back to legacy XXxx subdir (pre-B1 active shape)', async () => {
        const discussionId = '10040';
        const filename = `discussion-${discussionId}.md`;
        const legacyActivePath = path.join(aiConfig.issueSync.discussionsDir, '100xx', filename);
        await fs.ensureDir(path.dirname(legacyActivePath));
        await fs.writeFile(legacyActivePath, '# Legacy XXxx subdir discussion');

        const result = await LocalFileService.getDiscussionById(discussionId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Legacy XXxx subdir discussion');
        expect(result.filePath).toBe(legacyActivePath);
    });

    test('getDiscussionById falls back to archiveRoot when not in active', async () => {
        const discussionId = '8500';
        const filename = `discussion-${discussionId}.md`;
        const archivePath = path.join(aiConfig.issueSync.archiveRoot, 'discussions', 'v12.0.0', filename);
        await fs.ensureDir(path.dirname(archivePath));
        await fs.writeFile(archivePath, '# Archived discussion');

        const result = await LocalFileService.getDiscussionById(discussionId);

        expect(result.error).toBeUndefined();
        expect(result.content).toBe('# Archived discussion');
        expect(result.filePath).toBe(archivePath);
    });

    test('getDiscussionById returns NOT_FOUND when discussion exists nowhere', async () => {
        const result = await LocalFileService.getDiscussionById('99999');

        expect(result.code).toBe('NOT_FOUND');
        expect(result.error).toBe('File not found');
    });

    test('getIssueById accepts leading # in issue number', async () => {
        const issueId = '5555';
        const filename = `issue-${issueId}.md`;
        const activePath = path.join(aiConfig.issueSync.issuesDir, '55xx', filename);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, '# Issue with hash prefix');

        const result = await LocalFileService.getIssueById(`#${issueId}`);

        expect(result.content).toBe('# Issue with hash prefix');
    });
});
