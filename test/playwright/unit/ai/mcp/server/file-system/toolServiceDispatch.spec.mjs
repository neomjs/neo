import {setup} from '../../../../../setup.mjs';

const appName = 'FileSystemToolServiceDispatchTest';

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

// Bootstrap parity: importing toolService.mjs chains to Neo service classes that require
// Neo.gatekeep. The setup() call only configures Neo; the augmentation happens via these imports,
// and toolService.mjs itself is imported dynamically in beforeAll so it evaluates AFTER setup() —
// mirrors McpServerListToolsSmoke.spec.mjs.
import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../../../..'),
    openApiDoc = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/file-system/openapi.yaml'), 'utf8')),

    // `get_mcp_tool_handbook` is the one file-system tool whose handler is positional:
    // `toolId => toolService.getToolHandbook(toolId)`, the identical arrow all six servers use. The
    // cross-server form of this exception list lives beside the recurrence guard in
    // test/playwright/unit/ai/mcp/validation/OpenApiValidatorCompliance.spec.mjs.
    positionalTools = ['get_mcp_tool_handbook'];

/**
 * @summary Resolves the argument names ToolService derives for one operationId — the same union of
 * `parameters` and request-body properties that `initializeToolMapping()` builds. An operation with
 * no argument names dispatches identically either way, so only a non-empty result is interesting.
 * @param {String} operationId The tool name.
 * @returns {Object} `{argNames, operation}` for the matching operation.
 */
function getOperation(operationId) {
    for (const pathItem of Object.values(openApiDoc.paths || {})) {
        for (const operation of Object.values(pathItem || {})) {
            if (operation?.operationId !== operationId) continue;

            const argNames = (operation.parameters || []).map(parameter => parameter.name),
                  schema   = operation.requestBody?.content?.['application/json']?.schema;

            if (schema) {
                // No file-system operation uses a $ref today. If one starts to, resolving it is the
                // difference between this guard asserting and silently skipping, so it fails loudly
                // instead — a quietly empty argument list is the shape of the defect being fixed.
                expect(schema.$ref, `${operationId} uses a $ref request body; teach this helper to resolve it`).toBeUndefined();

                argNames.push(...Object.keys(schema.properties || {}));
            }

            return {argNames, operation};
        }
    }

    throw new Error(`operationId "${operationId}" is not declared in the file-system contract`);
}

/**
 * @summary Coverage for the seam between the OpenAPI contract and the file-system handlers.
 *
 * `ToolService.callTool()` branches on `x-pass-as-object`: declared, the validated object goes to
 * the handler whole; absent, the arguments are spread positionally. Every argument-taking
 * `FileSystemService` handler destructures a single object, and the file-system contract declared
 * the annotation on nothing — so every argument-taking tool of this server failed at call time from
 * the day the server was added.
 *
 * Nothing caught it, and the reason is structural: `FileSystemPolicy.spec.mjs` substitutes
 * `callTool` with a mock, and `FileSystemService.spec.mjs` calls the handlers directly with an
 * object. Both contracts were green while the join between them was broken. These tests exercise
 * the join, which is the only place the defect is observable.
 */
test.describe('ai/mcp/server/file-system — ToolService dispatch (#16231)', () => {
    const tmpDir = path.join(repoRoot, 'tmp', `fs-dispatch-spec-${process.pid}`),
          probe  = path.join(tmpDir, 'probe.mjs');

    let callTool, listTools;

    test.beforeAll(async () => {
        ({callTool, listTools} = await import('../../../../../../../ai/mcp/server/file-system/services/toolService.mjs'));

        await fs.ensureDir(tmpDir);
        await fs.writeFile(probe, 'export const ok = 1;\n', 'utf-8');
    });

    test.afterAll(async () => {
        await fs.remove(tmpDir).catch(() => {});
    });

    test('#16231 every argument-taking tool survives the real dispatch, not just a direct handler call', async () => {
        // The assertions are on real return values rather than "did not throw", because the broken
        // dispatch does not fail loudly: the handler receives a bare string, destructuring yields
        // `absolutePath === undefined`, and the sandbox guard reports that as a 403. A tool that
        // answers with the file's actual content cannot have been called that way.
        expect(await callTool('read_file', {absolutePath: probe}))
            .toEqual({content: 'export const ok = 1;\n'});

        expect(await callTool('write_file', {absolutePath: path.join(tmpDir, 'written.txt'), content: 'ok\n'}))
            .toBe('success');
        expect(await fs.readFile(path.join(tmpDir, 'written.txt'), 'utf-8')).toBe('ok\n');

        expect(await callTool('list_directory', {absolutePath: tmpDir}))
            .toEqual(expect.arrayContaining([{name: 'probe.mjs', isDirectory: false, isFile: true}]));

        expect(await callTool('check_syntax', {absolutePath: probe})).toBe('Syntax OK');
    });

    test('#16231 run_playwright_test reaches its OWN guard — the path arrived, it was simply out of bounds', async () => {
        // Distinguishing which 403 comes back is the whole point. Under the broken dispatch this
        // rejects from the sandbox guard because `absolutePath` is undefined; with the annotation in
        // place it rejects from the directory guard, which can only be reached by a real path string.
        // Asserting the second message therefore fails if the dispatch ever regresses.
        await expect(callTool('run_playwright_test', {absolutePath: probe}))
            .rejects.toThrow(/403 Forbidden: Can only execute Playwright specs/);
    });

    test('#16231 the two tools that must NOT be annotated keep working — the fix is per operation, not per file', async () => {
        // `healthcheck` takes no arguments at all; `get_mcp_tool_handbook` takes its toolId
        // positionally. Annotating the whole file would have broken the second one, so the contract
        // has to stay per operation.
        expect(await callTool('healthcheck', {})).toEqual({status: 'healthy'});
        expect(await callTool('get_mcp_tool_handbook', {toolId: 'read_file'}))
            .toMatchObject({toolId: 'read_file', found: true});
    });

    test('#16481 the not-jailed warning reaches the CALLER, not just the raw spec', async () => {
        // The warning is only worth anything on the surface a caller actually reads before handing
        // this tool a spec file. Both projections below resolve `operation.description` — neither
        // reads `info.description` — so putting the warning in top-level OpenAPI metadata satisfies
        // a human reading the YAML while leaving every MCP caller on the old isolated-spec wording.
        // Asserting the projected text is therefore the falsifier: it fails if the warning moves
        // back up to `info`, is deleted, or is softened into describing runner isolation again.
        const handbook = await callTool('get_mcp_tool_handbook', {toolId: 'run_playwright_test'});

        expect(handbook.handbook, 'the handbook a caller reads must carry the containment limit')
            .toMatch(/EXECUTION IS NOT JAILED/);

        // `tools/list` is the ordinary discovery path — a caller that never opens the handbook still
        // sees this one. Both must carry it, because either alone leaves a reachable blind surface.
        const {tools} = await listTools(),
              listed  = tools.find(tool => tool.name === 'run_playwright_test');

        expect(listed, 'run_playwright_test should be listed at all').toBeDefined();
        expect(listed.description, 'the listed description must carry the containment limit too')
            .toMatch(/EXECUTION IS NOT JAILED/);

        // The substantive claim, not just the shouty line: the reason the warning exists is that the
        // path guard bounds the ARGUMENT while the spec that runs is arbitrary JavaScript bounded by
        // the host process. A rewrite that keeps the banner but drops the mechanism fails here.
        expect(handbook.handbook).toMatch(/host process/);
    });

    test('#16231 every tool this server LISTS is annotated — the contract cannot grow past this spec unnoticed', async () => {
        // The dispatch tests above name the tools they call, so a seventh tool added later would
        // inherit the same 0-annotation treatment unnoticed. This one reads `tools/list` instead, so
        // the assertion widens with the surface rather than with this file.
        const {tools} = await listTools();

        expect(tools.length, 'file-system should expose tools at all').toBeGreaterThan(0);

        for (const tool of tools) {
            const {argNames, operation} = getOperation(tool.name);

            if (argNames.length === 0)                continue;
            if (positionalTools.includes(tool.name))  continue;

            expect(operation['x-pass-as-object'], `file-system.${tool.name} handler takes an object but the contract does not say so`).toBe(true);
        }
    });
});
