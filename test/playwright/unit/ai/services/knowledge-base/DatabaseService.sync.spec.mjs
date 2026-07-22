import {setup} from '../../../../setup.mjs';
setup({neoConfig: {unitTestMode: true}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs-extra';
import path           from 'path';

test.describe('Neo.ai.services.knowledge-base.DatabaseService sync', () => {
    let DatabaseService;
    let aiConfig;
    let VectorService;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
        DatabaseService = (await import('../../../../../../ai/services.mjs')).KB_DatabaseService;
        VectorService = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
    });

    test('createKnowledgeBase() emits type: adr chunks', async () => {
        const originalDataPath    = aiConfig.dataPath;
        const originalPullSources = aiConfig.sourcePaths.PullRequestSource;
        const testDataPath        = path.join(aiConfig.neoRootDir, 'dist', 'test-ai-knowledge-base.jsonl');

        try {
            aiConfig.dataPath = testDataPath;

            // This spec's subject is ADR emission, but `createKnowledgeBase()` runs EVERY source over
            // the live repo — so the assertion silently depended on the tracked pull corpus being
            // duplicate-free. It is not: that corpus carries divergent duplicates today, and
            // `PullRequestSource` now refuses them rather than embedding one PR's two renderings as
            // distinct evidence. Correct refusal, wrong test to fail: an ADR assertion should not be
            // coupled to the health of a different source's corpus.
            //
            // The coupling cannot be resolved by repairing the corpus first — the operator sync CLI is
            // dev-branch-gated, so the repair only runs post-merge, on dev. Waiting for a clean corpus
            // to land the code that cleans it is circular. So the pull source is scoped out HERE,
            // leaving the fail-closed consumer fully intact: `PullRequestSource.spec.mjs` covers the
            // refusal directly, and this spec goes back to testing what its name says.
            aiConfig.sourcePaths.PullRequestSource = [];

            // Generate the knowledge base
            const result = await DatabaseService.createKnowledgeBase();
            expect(result.message).toMatch(/created with \d+ chunks/);

            // Read the output
            expect(fs.existsSync(testDataPath)).toBe(true);
            const content = await fs.readFile(testDataPath, 'utf8');

            // Assert that ADR chunks were emitted
            const lines     = content.trim().split('\n');
            const adrChunks = lines.filter(line => {
                if (!line) return false;
                const chunk = JSON.parse(line);
                return chunk.type === 'adr';
            });

            expect(adrChunks.length).toBeGreaterThan(0);
        } finally {
            aiConfig.dataPath                      = originalDataPath;
            aiConfig.sourcePaths.PullRequestSource = originalPullSources;

            if (fs.existsSync(testDataPath)) {
                await fs.unlink(testDataPath);
            }
        }
    });

    test('embedKnowledgeBase forwards explicit staleStrategy while default remains unchanged', async () => {
        const originalEmbed = VectorService.embed.bind(VectorService);
        const calls         = [];

        VectorService.embed = async (knowledgeBasePath, options) => {
            calls.push({knowledgeBasePath, options});
            return {message: 'stubbed embed'};
        };

        try {
            await DatabaseService.embedKnowledgeBase({viaMcp: true});
            await DatabaseService.embedKnowledgeBase({staleStrategy: 'shadow-swap'});
        } finally {
            VectorService.embed = originalEmbed;
        }

        expect(calls[0]).toEqual({
            knowledgeBasePath: aiConfig.dataPath,
            options          : {
                viaMcp       : true,
                staleStrategy: undefined
            }
        });
        expect(calls[1]).toEqual({
            knowledgeBasePath: aiConfig.dataPath,
            options          : {
                viaMcp       : false,
                staleStrategy: 'shadow-swap'
            }
        });
    });
});
