import {setup} from '../../../../../setup.mjs';

const appName = 'KBClassHierarchyScopeTest';

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
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';

/**
 * `get_class_hierarchy` answers for Neo.mjs code EXCLUSIVELY, and a deployment whose Knowledge Base
 * has ingested a tenant's own repositories makes that non-obvious: a caller reasonably reads "the
 * class hierarchy from the knowledge base" as covering what that knowledge base contains.
 *
 * The scope claim has to live on the tier an agent actually reads. The KB server emits TWO
 * description tiers (`ToolService.buildToolListDescription` / `buildToolHandbookEntry`): the compact
 * `tools/list` line — capped at 120 chars, sourced `x-neo-tool-summary` → `summary` → description —
 * and the long `description`, served only on an explicit `get_mcp_tool_handbook` call. Stating the
 * scope in `description` alone leaves the default surface reading `Get Class Hierarchy`, which tells
 * a caller nothing; the caller who never fetches the handbook is exactly the one who misreads it.
 *
 * So these guards assert the DERIVED listed description rather than the YAML text, and pin the
 * precedence: drop `x-neo-tool-summary` and the compact line silently falls back to the bare
 * `summary` title, which the second assertion in the first test is there to catch.
 */
test.describe('knowledge-base get_class_hierarchy — the scope claim reaches the default-visible tier (#16065)', () => {

    const
        __filename = fileURLToPath(import.meta.url),
        __dirname  = path.dirname(__filename),
        repoRoot   = path.resolve(__dirname, '../../../../../../..');

    let listTools, callTool;

    test.beforeAll(async () => {
        ({listTools, callTool} = await import('../../../../../../../ai/mcp/server/knowledge-base/toolService.mjs'));
    });

    test('the compact tools/list line states the Neo.mjs-only scope — and is NOT the bare title', async () => {
        const
            {tools}    = await listTools(),
            tool       = tools.find(item => item.name === 'get_class_hierarchy'),
            openApiDoc = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
            operation  = openApiDoc.paths['/knowledge/hierarchy'].get;

        expect(tool, 'get_class_hierarchy must be listed').toBeTruthy();
        expect(tool.description).toContain('Neo.mjs code only');
        expect(tool.description.length, 'the compact tier is capped at 120').toBeLessThanOrEqual(120);

        // `buildToolListDescription` TRUNCATES past the cap instead of failing, and the scope phrase
        // sits early enough to survive a cut that would drop the not-covered clause — so asserting
        // the phrase alone would pass a half-sentence. Pin the tail and the absence of an ellipsis.
        expect(tool.description, 'an over-long summary is silently truncated, not rejected').not.toContain('...');
        expect(tool.description).toContain("not your own or any tenant's repositories");

        // The precedence control: `summary` is the fallback source, so a listed description EQUAL to
        // it proves `x-neo-tool-summary` was dropped and the scope silently left the default tier.
        expect(tool.description, 'the scope must beat the bare title through x-neo-tool-summary').not.toBe(operation.summary);
    });

    test('the handbook tier carries the not-covered clause, and neither tier seeds the framework category', async () => {
        const
            {tools}  = await listTools(),
            tool     = tools.find(item => item.name === 'get_class_hierarchy'),
            handbook = await callTool('get_mcp_tool_handbook', {toolId: 'get_class_hierarchy'});

        expect(handbook.found).toBe(true);
        expect(handbook.handbook).toContain('does NOT cover');
        expect(handbook.handbook).toContain('query_documents');

        // §neo_identity_anchor: tool descriptions are loaded into every agent's context as authority
        // on what a tool operates on, so this surface must not seed the framework prior. Scoped to
        // this one tool; the wider sweep across both openapi surfaces is tracked separately.
        expect(tool.description).not.toMatch(/framework/i);
        expect(handbook.handbook).not.toMatch(/framework/i);
    });

    test('the handbook prose cannot contradict the schema it ships beside', async () => {
        const
            handbook   = await callTool('get_mcp_tool_handbook', {toolId: 'get_class_hierarchy'}),
            openApiDoc = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
            operation  = openApiDoc.paths['/knowledge/hierarchy'].get,
            rootParam  = operation.parameters.find(parameter => parameter.name === 'root');

        // DERIVED from the schema rather than restated, so flipping `required` forces the prose to
        // follow instead of leaving the two to disagree. This caught a real drift: the description
        // called `root` optional two lines above `required: true`, and claimed a missing build artifact
        // yields an empty/partial map — which is `ApiSource`'s ingestion-enrichment behaviour, not this
        // tool's. `QueryService.getClassHierarchy` THROWS on both an absent root and an absent artifact.
        // Describing a sibling consumer of the same artifact is the same misattribution this whole
        // surface exists to prevent, so it gets a guard rather than a correction.
        expect(/\(Optional\)/.test(handbook.handbook)).toBe(!rootParam.required);
        expect(/REQUIRED/.test(handbook.handbook)).toBe(Boolean(rootParam.required));

        // The fail-loud contract is what a caller plans around; a degrade-to-partial claim would send
        // them to check for thin results instead of handling an error.
        expect(handbook.handbook).toMatch(/fails LOUD/);
        expect(handbook.handbook).not.toMatch(/empty or partial/)
    })
});
