import {setup} from '../../../../setup.mjs';

const appName = 'GoldenPathSynthesizerTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import child_process  from 'child_process';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.GoldenPathSynthesizer', () => {
    let GoldenPathSynthesizer;
    let aiConfig;
    let logger;
    let GraphService;
    let SystemLifecycleService;
    
    let tmpHandoffFile;
    let originalExecSync;
    
    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
        const os = await import('os');
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const testDbName = `memory-core-goldenpath-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath = path.join(tmpDir, testDbName);
        aiConfig.storagePaths.graph = testDbPath;
        
        tmpHandoffFile = path.join(tmpDir, `mock_sandman_handoff_${process.pid}_${Date.now()}.md`);
        aiConfig.handoffFilePath = tmpHandoffFile;

        GoldenPathSynthesizer = (await import('../../../../../../ai/daemons/services/GoldenPathSynthesizer.mjs')).default;
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        logger = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        
        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }
    });

    test.beforeEach(() => {
        originalExecSync = child_process.execSync;
    });

    test.afterEach(() => {
        child_process.execSync = originalExecSync;
        if (fs.existsSync(tmpHandoffFile)) {
            try { fs.unlinkSync(tmpHandoffFile); } catch(e) {}
        }
    });

    test.afterAll(async () => {
        const testDbPath = aiConfig.storagePaths.graph;
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');
    });

    test('synthesizeGoldenPath appends Active PR Cycle State from GitHub CLI output', async () => {
        // Mock gh pr list output
        const mockPrData = [
            {
                number: 11178,
                url: "https://github.com/neomjs/neo/pull/11178",
                author: { login: "neo-gemini-3-1-pro" },
                title: "feat(ai): Automate PR Cycle State Extraction",
                body: "lane-state: AWAITING_REVIEW\nCycle 2",
                headRefOid: "abcdef1234567890",
                reviewRequests: [{ login: "neo-opus-4-7" }],
                reviews: [
                    { state: "CHANGES_REQUESTED", body: "Needs more scope reduction.", submittedAt: "2026-05-11T00:00:00Z" }
                ],
                comments: []
            }
        ];

        const originalFetchOpenPRs = GoldenPathSynthesizer.fetchOpenPRs;
        GoldenPathSynthesizer.fetchOpenPRs = async () => mockPrData;

        await GoldenPathSynthesizer.synthesizeGoldenPath();
        
        GoldenPathSynthesizer.fetchOpenPRs = originalFetchOpenPRs;

        const handoffContent = fs.readFileSync(tmpHandoffFile, 'utf-8');
        
        expect(handoffContent).toContain('## Active PR Cycle State');
        expect(handoffContent).toContain('### @neo-gemini-3-1-pro');
        expect(handoffContent).toContain('- **PR #11178**: [feat(ai): Automate PR Cycle State Extraction](https://github.com/neomjs/neo/pull/11178)');
        expect(handoffContent).toContain('- **Lane State**: `AWAITING_REVIEW`');
        expect(handoffContent).toContain('- **Cycle**: `2`');
        expect(handoffContent).toContain('- **Reviewers**: neo-opus-4-7');
        expect(handoffContent).toContain('- **Status**: `CHANGES_REQUESTED`');
        expect(handoffContent).toContain('- **Head SHA**: `abcdef1234567890`');
    });
});
