import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

test.describe('GitHub Workflow MCP Server Tool Registration', () => {
    test('list_issues is registered in toolService.mjs', () => {
        const filePath = path.resolve(__dirname, '../../../../ai/mcp/server/github-workflow/services/toolService.mjs');

        expect(fs.existsSync(filePath), `toolService.mjs not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8');

        const match = fileContent.match(/serviceMapping\s*=\s*\{([\s\S]*?)\};?/m);
        expect(match, 'serviceMapping block not found in toolService.mjs').toBeDefined();

        const body = match[1];
        const keys = [...body.matchAll(/(?:['\\"])?([a-zA-Z0-9_]+)(?:['\\"])?\s*:/g)].map(x=>x[1]);

        expect(keys.includes('list_issues'), `FAIL: list_issues not found in toolService mapping. Keys found: ${keys.join(', ')}`).toBe(true);
    });
});
