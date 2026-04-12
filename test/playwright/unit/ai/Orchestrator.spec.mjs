import test         from '@playwright/test';
import fs           from 'fs';
import path         from 'path';
import Neo          from '../../../../src/Neo.mjs';
import * as core    from '../../../../src/core/_export.mjs';
import Orchestrator from '../../../../ai/agent/Orchestrator.mjs';

test.describe('Neo.ai.agent.Orchestrator', () => {
    test('Golden Path regex correctly extracts issue IDs and descriptions', async () => {
        const content = `
# Autonomous Handoff

## Computed Golden Path (Strategic Recommendation)

Based on priorities, the following tasks are mathematically recommended:

1. **issue-9900**: Score 3.25 (Semantic: 1.12, Structural: 1.00)
   - *docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base*
2. **issue-9844**: Score 2.08 (Semantic: 1.04, Structural: 0.00)
   - *feat: Implement Safe Commit Pipeline for Autonomous Agent Execution*

> **Strategic Interpretation:**
> Pivot memory synthesis.
`;

        const testHandoffPath = path.resolve(process.cwd(), '.neo-test-handoff.md');
        fs.writeFileSync(testHandoffPath, content, 'utf-8');

        try {
            const orchestrator = Neo.create(Orchestrator, {
                handoffPath: testHandoffPath
            });

            const directives = orchestrator.parseGoldenPath();

            test.expect(directives).not.toBeNull();
            test.expect(directives.length).toBe(2);
            test.expect(directives[0].issueId).toBe('9900');
            test.expect(directives[0].description).toBe('docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base');
            test.expect(directives[1].issueId).toBe('9844');
        } finally {
            if (fs.existsSync(testHandoffPath)) {
                fs.unlinkSync(testHandoffPath);
            }
        }
    });
});

