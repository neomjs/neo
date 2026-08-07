import {setup} from '../../../../../setup.mjs';

const appName = 'GitHubWorkflowCommentGuidanceTest';

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
 * A correction to a ticket or PR belongs in its BODY. Appending it as a comment leaves the stale
 * claim authoritative, because a reader hits the body first and stops there — and on a PR the body
 * IS the contract a reviewer verifies acceptance criteria against.
 *
 * The rule already existed in `ticket-create-workflow.md` §11 and still did not fire: a create-time
 * skill is not in context when an agent returns to a day-old ticket to record a finding, and it
 * should not be — re-reading a creation payload to write a comment would be pure token waste. So the
 * guidance has to ride the surface that re-arrives on every schema load instead: the compact
 * `tools/list` line for `manage_issue_comment`.
 *
 * These guards assert the DERIVED tiers rather than the YAML text, because the two differ.
 * `ToolService.buildToolListDescription` sources `x-neo-tool-summary` → `summary` → description and
 * then TRUNCATES past the cap instead of failing — and this label's operative clause ("not a
 * comment") sits at the very END, so a silent cut would keep the phrase that reads like compliance
 * while dropping the instruction. Hence the tail pin and the ellipsis check.
 */
test.describe('github-workflow manage_issue_comment — BODY-vs-COMMENT guidance reaches both description tiers (#16602)', () => {

    const
        __filename = fileURLToPath(import.meta.url),
        __dirname  = path.dirname(__filename),
        repoRoot   = path.resolve(__dirname, '../../../../../../..'),
        serverDir  = path.join(repoRoot, 'ai/mcp/server/github-workflow'),
        // The bare label this replaced. Kept as the precedence control: a derived description EQUAL
        // to it proves the guidance silently left the default-visible tier.
        legacyLabel = 'Manage Comments (Create or Update)';

    let listTools, callTool;

    test.beforeAll(async () => {
        ({listTools, callTool} = await import('../../../../../../../ai/mcp/server/github-workflow/toolService.mjs'));
    });

    test('the compact tools/list line carries the imperative, tail intact and untruncated', async () => {
        const
            {tools} = await listTools(),
            tool    = tools.find(item => item.name === 'manage_issue_comment'),
            // DERIVED from the server's own config rather than restating 120, so lowering the cap
            // forces this guard to follow instead of leaving the two to disagree.
            capSource = fs.readFileSync(path.join(serverDir, 'toolService.mjs'), 'utf8'),
            capMatch  = capSource.match(/toolListDescriptionMaxLength\s*:\s*(\d+)/),
            cap       = Number(capMatch?.[1]);

        expect(capMatch, 'toolListDescriptionMaxLength must be declared in the server toolService').toBeTruthy();
        expect(tool, 'manage_issue_comment must be listed').toBeTruthy();

        expect(tool.description).toContain('corrections go in the BODY');
        expect(tool.description.length, `the compact tier is capped at ${cap}`).toBeLessThanOrEqual(cap);

        // The operative clause is the LAST thing in the label, so asserting the phrase above alone
        // would pass a half-sentence that reads as guidance while instructing nothing.
        expect(tool.description, 'an over-long summary is silently truncated, not rejected').not.toContain('...');
        expect(tool.description, 'the instruction, not just the topic, must survive the cap').toContain('not a comment');

        // Precedence control: the compact tier resolves `x-neo-tool-summary` → `summary` →
        // description, so a listed description EQUAL to `summary` proves the annotation was dropped
        // and the guidance silently fell back to the bare title.
        expect(tool.description, 'the guidance must beat the bare title').not.toBe(legacyLabel);
    });

    test('the imperative is emitted ONCE — the title stays the stable 34-char name', async () => {
        const
            {tools}    = await listTools(),
            tool       = tools.find(item => item.name === 'manage_issue_comment'),
            openApiDoc = yaml.load(fs.readFileSync(path.join(serverDir, 'openapi.yaml'), 'utf8')),
            operation  = openApiDoc.paths['/comments/manage'].post;

        // `ToolService` sets `title: operation.summary` AND falls back to `summary` for the compact
        // description. So putting the imperative in `summary` emits it in BOTH fields: measured at
        // +118 chars on the projected record rather than the +59 the label alone suggests. Measuring
        // the yaml field instead of the emitted record is what hid that, and this guard exists
        // because the cheap measurement and the real cost differ by a factor of two.
        expect(tool.title, 'the title must stay the stable name, not carry the guidance').toBe(legacyLabel);
        expect(operation.summary, 'summary is the title source and must not carry the imperative').toBe(legacyLabel);
        expect(operation['x-neo-tool-summary'], 'the imperative belongs in the annotation, emitted once').toContain('not a comment');

        // The record cost, asserted rather than trusted: title + description, with the imperative
        // appearing exactly once across the pair.
        const emitted     = `${tool.title}${tool.description}`,
              occurrences = emitted.split('corrections go in the BODY').length - 1;

        expect(occurrences, 'the imperative must appear exactly once across title + description').toBe(1);
    });

    test('the handbook tier carries the reasons and the BODY-vs-COMMENT distinction', async () => {
        const handbook = await callTool('get_mcp_tool_handbook', {toolId: 'manage_issue_comment'});

        expect(handbook.found).toBe(true);

        // The distinction is what keeps this from over-correcting into "never comment": review
        // responses and answers to a peer are exactly what a comment is FOR.
        expect(handbook.handbook).toContain('BODY = state');
        expect(handbook.handbook).toContain('COMMENT = dialogue');

        // Both reasons, because either alone invites a workaround: without the reviewer clause the
        // cost reads as tidiness, and without the sediment clause "I will add one more comment"
        // still looks cheap.
        expect(handbook.handbook, 'the reviewer-reads-the-body-for-ACs cost').toContain('acceptance criteria');
        expect(handbook.handbook, 'the read-in-full-to-be-safe cost').toContain('read in full');
    });

    test("the 'update' action no longer routes ticket corrections into a comment", async () => {
        const
            handbook   = await callTool('get_mcp_tool_handbook', {toolId: 'manage_issue_comment'}),
            openApiDoc = yaml.load(fs.readFileSync(path.join(serverDir, 'openapi.yaml'), 'utf8')),
            operation  = openApiDoc.paths['/comments/manage'].post;

        // This tier used to advise using 'update' "To correct mistakes" — with no scope on WHOSE
        // mistake, it endorsed the exact anti-pattern the compact label now warns against. The
        // positive assertion is the real guard; the negative pins the specific regression.
        expect(handbook.handbook, "'update' must route claim-corrections to the body").toContain('edit the body instead');
        expect(handbook.handbook, 'the superseded advice must not return').not.toContain('To correct mistakes');

        // Scoped, not banned: correcting your own dialogue and collapsing a superseded comment to a
        // pointer are both legitimate — the second is how consolidation removes the sediment tax.
        expect(handbook.handbook).toContain('one-line pointer');

        // The handbook resolves `operation.description`, so a guard that passed while the YAML lost
        // the text would mean the tiers had drifted apart.
        expect(operation.description, 'the handbook tier is sourced from operation.description').toContain('BODY = state');
    });
});
