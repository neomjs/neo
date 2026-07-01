import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

test.describe('GitHub Workflow MCP Server Tool Registration', () => {
    test('list_issues is registered in toolService.mjs', () => {
        const filePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/toolService.mjs');

        expect(fs.existsSync(filePath), `toolService.mjs not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8');

        const match = fileContent.match(/serviceMapping\s*=\s*\{([\s\S]*?)\};?/m);
        expect(match, 'serviceMapping block not found in toolService.mjs').toBeDefined();

        const body = match[1];
        const keys = [...body.matchAll(/(?:['\\"])?([a-zA-Z0-9_]+)(?:['\\"])?\s*:/g)].map(x=>x[1]);

        expect(keys.includes('list_issues'), `FAIL: list_issues not found in toolService mapping. Keys found: ${keys.join(', ')}`).toBe(true);
    });

    test('manage_issue_projects is registered in toolService.mjs (#11233 Phase 1)', () => {
        const filePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/toolService.mjs');

        expect(fs.existsSync(filePath), `toolService.mjs not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8');

        const match = fileContent.match(/serviceMapping\s*=\s*\{([\s\S]*?)\};?/m);
        expect(match, 'serviceMapping block not found in toolService.mjs').toBeDefined();

        const body = match[1];
        const keys = [...body.matchAll(/(?:['\\"])?([a-zA-Z0-9_]+)(?:['\\"])?\s*:/g)].map(x=>x[1]);

        expect(keys.includes('manage_issue_projects'),
            `FAIL: manage_issue_projects not found in toolService mapping — #11233 substrate-correct ProjectV2 membership primitive (replaces release:v* label-as-proxy). Keys found: ${keys.join(', ')}`
        ).toBe(true);
    });

    test('manage_pr_review is registered in toolService.mjs (#11273)', () => {
        const filePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/toolService.mjs');

        expect(fs.existsSync(filePath), `toolService.mjs not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8');

        const match = fileContent.match(/serviceMapping\s*=\s*\{([\s\S]*?)\};?/m);
        expect(match, 'serviceMapping block not found in toolService.mjs').toBeDefined();

        const body = match[1];
        const keys = [...body.matchAll(/(?:['\\"])?([a-zA-Z0-9_]+)(?:['\\"])?\s*:/g)].map(x=>x[1]);

        expect(keys.includes('manage_pr_review'),
            `FAIL: manage_pr_review not found in toolService mapping — #11273 substrate-correct atomic-PR-review primitive (closes formal-state gap pattern from PR #11234 + PR #11271 empirical anchors). Keys found: ${keys.join(', ')}`
        ).toBe(true);
    });

    test('create_issue documents @me for assignee self-assignment (#12038)', () => {
        const filePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/openapi.yaml');

        expect(fs.existsSync(filePath), `openapi.yaml not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8'),
              doc         = yaml.load(fileContent),
              operation   = doc.paths['/issues'].post,
              assignees   = operation.requestBody.content['application/json'].schema.properties.assignees;

        expect(operation.operationId).toBe('create_issue');
        expect(assignees.description).toContain('@me');
        expect(assignees.example).toContain('@me');
    });
});
