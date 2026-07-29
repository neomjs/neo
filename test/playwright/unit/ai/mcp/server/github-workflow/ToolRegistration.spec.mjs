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

    test('validate_pr_review_body is registered in toolService.mjs (#14688)', () => {
        const filePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/toolService.mjs');

        expect(fs.existsSync(filePath), `toolService.mjs not found at ${filePath}`).toBe(true);

        const fileContent = fs.readFileSync(filePath, 'utf8');

        const match = fileContent.match(/serviceMapping\s*=\s*\{([\s\S]*?)\};?/m);
        expect(match, 'serviceMapping block not found in toolService.mjs').toBeDefined();

        const body = match[1];
        const keys = [...body.matchAll(/(?:['\\"])?([a-zA-Z0-9_]+)(?:['\\"])?\s*:/g)].map(x=>x[1]);

        expect(keys.includes('validate_pr_review_body'),
            `FAIL: validate_pr_review_body not found in toolService mapping — #14688 pre-post review-body lint primitive. Keys found: ${keys.join(', ')}`
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

    test('list_issues declares the cursor input its endCursor tells callers to use', () => {
        const filePath = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/openapi.yaml');

        const fileContent = fs.readFileSync(filePath, 'utf8'),
              doc         = yaml.load(fileContent),
              operation   = doc.paths['/issues'].get,
              paramNames  = operation.parameters.map(parameter => parameter.name),
              response    = doc.components.schemas.IssueListResponse.properties;

        expect(operation.operationId).toBe('list_issues');

        // The response advertised `endCursor` as the way to continue while the tool surface declared no
        // cursor input. `x-pass-as-object` hands the handler a zod-VALIDATED object built from these
        // parameters, and zod strips unknown keys — so a caller passing the advertised cursor was not
        // told it was undeclared, it silently re-read page one. An undeclared continuation is worse than
        // an absent one: the response documents a capability the surface removes without saying so.
        expect(response.endCursor).toBeDefined();
        expect(paramNames).toContain('cursor');
        expect(operation.parameters.find(parameter => parameter.name === 'cursor').schema.type).toBe('string');
    });

    test('#16029 extends get_conversation without growing the MCP operation catalog', () => {
        const filePath   = path.resolve(__dirname, '../../../../../../../ai/mcp/server/github-workflow/openapi.yaml');
        const doc        = yaml.load(fs.readFileSync(filePath, 'utf8'));
        const operations = Object.values(doc.paths).flatMap(pathItem =>
            Object.values(pathItem).filter(value => value?.operationId)
        );
        const operation    = operations.find(value => value.operationId === 'get_conversation');
        const projection   = operation.requestBody.content['application/json'].schema.properties.projection;
        const operationIds = operations.map(value => value.operationId);

        expect(projection.enum).toEqual(['conversation', 'merge-readiness']);
        expect(operationIds.filter(id => id === 'get_conversation')).toHaveLength(1);
        expect(operationIds).not.toContain('certify_merge_readiness');
    });
});
