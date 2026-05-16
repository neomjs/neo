import {setup} from '../../../../../setup.mjs';

const appName = 'SkillSourceTest';

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

test.describe('Neo.ai.services.knowledge-base.source.SkillSource', () => {
    let SkillSource;
    let aiConfig;
    let originalRoot;
    let mockRoot;

    test.beforeAll(async () => {
        aiConfig    = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        SkillSource = (await import('../../../../../../../ai/services/knowledge-base/source/SkillSource.mjs')).default;

        originalRoot = aiConfig.neoRootDir;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        fs.ensureDirSync(tmpDir);
        mockRoot = path.join(tmpDir, `skill-source-mock-${process.pid}-${Date.now()}`);

        const skillsDir = path.join(mockRoot, '.agents/skills');
        fs.ensureDirSync(path.join(skillsDir, 'ideation-sandbox/references/audits'));
        fs.ensureDirSync(path.join(skillsDir, 'legacy-skill/references'));
        fs.ensureDirSync(path.join(skillsDir, 'simple-skill'));

        // Monolith SKILL.md with YAML frontmatter
        fs.writeFileSync(path.join(skillsDir, 'ideation-sandbox/SKILL.md'),
`---
name: custom-ideation
triggers: use when exploring
---

# Overview
Ideation description.

# Rules
1. Do this
2. Do that`);

        // Workflow map with a trigger-pointer target
        fs.writeFileSync(path.join(skillsDir, 'ideation-sandbox/references/workflow.md'),
`## Stage 1
<!-- trigger: edge-case validation → read ./audits/rare-rule.md -->
Stage 1 details.
## Stage 2
Stage 2 details.`);

        fs.writeFileSync(path.join(skillsDir, 'ideation-sandbox/references/audits/rare-rule.md'),
`# Rare Rule
Rare rule details.`);

        // Simple skill without YAML
        fs.writeFileSync(path.join(skillsDir, 'simple-skill/SKILL.md'),
`# Simple
Simple skill contents.`);

        // Legacy reference payload without trigger-pointer metadata keeps fallback behavior.
        fs.writeFileSync(path.join(skillsDir, 'legacy-skill/references/legacy.md'),
`# Legacy
Legacy skill payload.`);

        aiConfig.neoRootDir = mockRoot;
    });

    test.afterAll(() => {
        aiConfig.neoRootDir = originalRoot;
        if (mockRoot && fs.existsSync(mockRoot)) fs.removeSync(mockRoot);
    });

    test('is a Neo.setupClass singleton with the expected className and extract() method', () => {
        expect(SkillSource, 'default export must resolve').toBeDefined();
        expect(SkillSource.className).toBe('Neo.ai.services.knowledge-base.source.SkillSource');
        expect(typeof SkillSource.extract).toBe('function');
    });

    test('extract() emits correctly typed and chunked skills with sub-metadata', async () => {
        const written = [];
        const writeStream = {
            write(chunkStr) {
                written.push(JSON.parse(chunkStr.trim()));
                return true;
            }
        };
        const createHashFn = chunk => 'hash:' + chunk.name;

        const count = await SkillSource.extract(writeStream, createHashFn);

        // ideation-sandbox SKILL.md -> Overview chunk + Rules chunk (2)
        // ideation-sandbox workflow.md -> Stage 1 + Stage 2 (2)
        // ideation-sandbox rare-rule.md -> Rare Rule (1)
        // simple-skill SKILL.md -> Simple (1)
        // legacy-skill legacy.md -> Legacy (1)
        expect(count).toBe(7);
        expect(written).toHaveLength(7);

        const ideationChunks = written.filter(w => w.skillName === 'custom-ideation');
        expect(ideationChunks).toHaveLength(2);

        const overviewChunk = ideationChunks.find(w => w.sectionAnchor === 'Overview');
        expect(overviewChunk).toBeDefined();
        expect(overviewChunk).toMatchObject({
            type: 'skill',
            kind: 'skill',
            triggerCondition: 'use when exploring',
            isAtlasMonolithSubRule: false,
            content: '# Overview\nIdeation description.',
            name: 'custom-ideation - Overview'
        });

        const rulesChunk = ideationChunks.find(w => w.sectionAnchor === 'Rules');
        expect(rulesChunk).toBeDefined();

        const workflowChunks = written.filter(w => w.skillName === 'ideation-sandbox' && w.sectionAnchor.startsWith('Stage'));
        expect(workflowChunks).toHaveLength(2);
        expect(workflowChunks[0].triggerCondition).toBe('');
        expect(workflowChunks.every(w => !w.isAtlasMonolithSubRule)).toBe(true);

        const rareRuleChunk = written.find(w => w.source.endsWith('rare-rule.md'));
        expect(rareRuleChunk).toBeDefined();
        expect(rareRuleChunk.isAtlasMonolithSubRule).toBe(true);

        const simpleChunk = written.find(w => w.skillName === 'simple-skill');
        expect(simpleChunk).toBeDefined();
        expect(simpleChunk.triggerCondition).toBe('');
        expect(simpleChunk.isAtlasMonolithSubRule).toBe(false);

        const legacyChunk = written.find(w => w.skillName === 'legacy-skill');
        expect(legacyChunk).toBeDefined();
        expect(legacyChunk.isAtlasMonolithSubRule).toBe(true);
    });

    test('extract() returns 0 and writes nothing when the skills directory is absent', async () => {
        const missingRoot = path.join(mockRoot, 'does-not-exist');
        aiConfig.neoRootDir = missingRoot;
        try {
            const written = [];
            const writeStream = {
                write(chunkStr) { written.push(chunkStr); return true; }
            };

            const count = await SkillSource.extract(writeStream, () => 'h');

            expect(count).toBe(0);
            expect(written).toHaveLength(0);
        } finally {
            aiConfig.neoRootDir = mockRoot;
        }
    });


});
