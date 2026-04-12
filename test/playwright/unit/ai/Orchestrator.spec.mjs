import test from '@playwright/test';
import fs   from 'fs';
import path from 'path';

test.describe('Neo.ai.agent.Orchestrator', () => {
    test('Golden Path regex correctly extracts issue IDs and descriptions', async () => {
        // Mock content simulating a typical sandman_handoff.md output
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

        const goldenPathMatch = content.match(/## Computed Golden Path[^\n]*\n([\s\S]*?)(?=\n#|$)/);
        test.expect(goldenPathMatch).not.toBeNull();
        
        const sectionChunk = goldenPathMatch[1];
        const directives = [];
        const regex = /\d+\.\s\*\*issue-(\d+)\*\*:[^\n]*\n\s+-\s\*(.*?)\*/g;
        let match;

        while ((match = regex.exec(sectionChunk)) !== null) {
            directives.push({
                issueId    : match[1],
                description: match[2].trim()
            });
        }

        test.expect(directives.length).toBe(2);
        test.expect(directives[0].issueId).toBe('9900');
        test.expect(directives[0].description).toBe('docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base');
        test.expect(directives[1].issueId).toBe('9844');
    });
});
