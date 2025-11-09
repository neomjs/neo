import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

test.describe('GitHub Workflow MCP Server OpenAPI Issues', () => {
    test('openapi.yaml contains /issues path and IssueListResponse schema', () => {
        const filePath = path.resolve(__dirname, '../../../../ai/mcp/server/github-workflow/openapi.yaml');

        expect(fs.existsSync(filePath), `openapi.yaml not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const hasPath     = /(^|\n)\s*\/issues\s*:/m.test(fileContent) || /\/issues\b/.test(fileContent);
        const hasSchema   = /IssueListResponse\b/.test(fileContent) || /components:[\s\S]*IssueListResponse/m.test(fileContent);

        expect(hasPath, 'FAIL: openapi.yaml missing /issues path').toBe(true);
        expect(hasSchema, 'FAIL: openapi.yaml missing IssueListResponse schema').toBe(true);
    });
});
