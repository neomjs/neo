import {setup} from '../../../setup.mjs';

const appName = 'AiContextAssemblerTest';

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

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import ContextAssembler from '../../../../../ai/context/Assembler.mjs';
import fs               from 'fs';
import path             from 'path';

test.describe('Neo.ai.context.Assembler', () => {
    let assembler;

    test.beforeEach(async () => {
        assembler = Neo.create(ContextAssembler);
        // We mock out the services to avoid real DB connections for this specific unit test
        assembler.initAsync = async function() {
            this.skillsContext = this.loadSkillsSync();
        };
        await assembler.initAsync();
    });

    test('loadSkillsSync should extract YAML frontmatter for progressive disclosure', async () => {
        const skillsDir = path.resolve(process.cwd(), '.agent/skills');
        const ideationPath = path.join(skillsDir, 'ideation-sandbox', 'SKILL.md');
        
        let hasIdeationSandbox = false;

        if (fs.existsSync(ideationPath)) {
             hasIdeationSandbox = true;
        }

        // Validate that if there's any file there, `<agent_skills>` tag wraps it
        if (assembler.skillsContext !== '') {
            expect(assembler.skillsContext).toContain('<agent_skills>');
        }
        
        if (hasIdeationSandbox) {
            expect(assembler.skillsContext).toContain('<skill>');
            expect(assembler.skillsContext).toContain('<path>');
            expect(assembler.skillsContext).toContain('ideation-sandbox/SKILL.md');
            expect(assembler.skillsContext).toContain('name: ideation-sandbox');
        }
    });

    test('augmentSystemPrompt strictly appends loaded skills to base prompt', async () => {
        const base = 'You are a mock agent.';
        const rag = '\n[RAG Context]';
        
        // Setup mock skills context
        assembler.skillsContext = '\n<agent_skills>MockSkill</agent_skills>\n';
        
        const finalPrompt = assembler.augmentSystemPrompt(base, rag);
        
        expect(finalPrompt).toContain(base);
        expect(finalPrompt).toContain('<agent_skills>MockSkill</agent_skills>');
        expect(finalPrompt).toContain(rag);
    });
});
