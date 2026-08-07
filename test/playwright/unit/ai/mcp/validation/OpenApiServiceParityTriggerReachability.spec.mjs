import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import {load as yamlLoad} from 'js-yaml';
import micromatch         from 'micromatch';

import {SERVERS} from '../../../../../../ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs';

const repoRoot     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
      workflowPath = path.join(repoRoot, '.github/workflows/openapi-service-parity-lint.yml');

/**
 * TRIGGER REACHABILITY for the parity gate: does the guard actually RUN on the files it reads?
 *
 * A correct checker that never executes on the change which broke it is worth less than no checker,
 * because its absence from a PR's check list reads as coverage. That is not a hypothetical: the three
 * ToolService authorities were added to `pull_request.paths` and omitted from `push.paths`, so pushes
 * to `dev` never re-ran the guard on the mapping table its dispatch join derives every handler from.
 * @neo-gpt found it with micromatch after the code fixes had already been accepted.
 *
 * Two distinct properties are asserted, and the second is the one that stops a recurrence:
 *
 * 1. Every source authority the lint READS matches at least one path filter.
 * 2. `push.paths` and `pull_request.paths` are SET-EQUAL. GitHub Actions does not reliably expand
 *    YAML anchors in workflow files, so the workflow necessarily holds two copies of one list — and
 *    the only thing between two copies and silent divergence is a mechanical equality check. Adding
 *    an authority to one block and not the other is precisely the mistake that occurred, and reviewer
 *    attention is the wrong layer for it: the omission is invisible in a diff that shows the addition.
 */

const workflow  = yamlLoad(fs.readFileSync(workflowPath, 'utf8')),
      prPaths   = workflow.on.pull_request.paths,
      pushPaths = workflow.on.push.paths;

test.describe('parity gate trigger reachability', () => {
    test('push.paths and pull_request.paths are SET-EQUAL', () => {
        // Sorted comparison rather than index-wise, so a reordering is not a failure while a missing
        // or extra entry is. Order carries no meaning to GitHub; membership carries all of it.
        expect([...pushPaths].sort(), 'a filter present on one trigger and absent on the other is the live defect this guards')
            .toEqual([...prPaths].sort());
    });

    test('every source authority the lint reads is matched by a path filter', () => {
        // Derived from SERVERS rather than listed, so a new MCP server is covered the moment it is
        // registered — the same reason the transform corpus is harvested instead of enumerated.
        const authorities = [
            'ai/services.mjs',
            'ai/mcp/ToolService.mjs',
            'ai/scripts/lint/lint-openapi-service-parity.mjs',
            'ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs',
            ...SERVERS.map(server => server.toolService),
            ...SERVERS.map(server => server.openApi)
        ];

        for (const file of authorities) {
            expect(micromatch.isMatch(file, prPaths),  `pull_request must trigger on ${file}`).toBe(true);
            expect(micromatch.isMatch(file, pushPaths), `push must trigger on ${file}`).toBe(true);
        }
    });

    test('a handler module OUTSIDE the service tree is matched — the omission that was live', () => {
        // `ingestSourceFilesTool.mjs` is a real resolved handler that lives under `ai/mcp/server/**`
        // and NOT under `ai/services/**`, so the original `ai/services/**/*.mjs` filter missed it.
        const handler = 'ai/mcp/server/knowledge-base/ingestSourceFilesTool.mjs';

        expect(fs.existsSync(path.join(repoRoot, handler)), 'the fixture must name a REAL file, or it proves nothing').toBe(true);
        expect(micromatch.isMatch(handler, prPaths)).toBe(true);
        expect(micromatch.isMatch(handler, pushPaths)).toBe(true);
    });

    test('NEGATIVE CONTROL: an unrelated file does NOT trigger the gate', () => {
        // Without this, a filter of `**` would satisfy every assertion above while making the gate
        // run on every commit in the repo — passing the letter of reachability and destroying its point.
        for (const unrelated of ['src/component/Base.mjs', 'README.md', 'apps/portal/view/Viewport.mjs']) {
            expect(micromatch.isMatch(unrelated, prPaths),  `${unrelated} must not trigger`).toBe(false);
            expect(micromatch.isMatch(unrelated, pushPaths), `${unrelated} must not trigger`).toBe(false);
        }
    });
});
