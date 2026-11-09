import { test, expect }  from '@playwright/test';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml         from 'js-yaml';

/**
 * @summary The PR Baseline caller supersedes a run for an older head, and never one for the same head.
 *
 * Every push or body edit starts a baseline run of ten jobs. Without a concurrency group the previous
 * run keeps its place in the queue and later spends ten of the organization's twenty slots on a head
 * nobody proposes any more. Two constraints shape the group:
 *
 * - A rerun keeps its original ref, so a group keyed on the ref alone lets an obsolete rerun cancel
 *   the current head's run. First attempts share the ref's group; a rerun gets its own.
 * - `same-head-check-repair.yml` reruns every earlier red run of PR Baseline on the same head,
 *   cancelled ones included, once a later run passes. A body edit (`edited`, same head) that
 *   cancelled the running run would therefore buy a full rerun, so it waits instead.
 */
const repoRoot     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'),
      readWorkflow = name => yaml.load(fs.readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8'));

test.describe('PR Baseline caller — concurrency', () => {

    test('first attempts share one group per ref, and a rerun gets its own', () => {
        const {concurrency} = readWorkflow('pr-baseline.yml');

        expect(String(concurrency?.group)).toContain("github.run_attempt == '1' && github.ref || github.run_id");
    });

    test('a new head cancels the running run, a body edit does not', () => {
        const {concurrency} = readWorkflow('pr-baseline.yml');

        expect(String(concurrency?.['cancel-in-progress'])).toBe("${{ github.event.action != 'edited' }}");
    });

    test('the same-head repair still watches PR Baseline, which is why an edit must not cancel', () => {
        // If the repair stops watching this workflow, the `edited` exception loses its reason and
        // the condition above can simplify; until then, removing it turns body edits into reruns
        const repair = readWorkflow('same-head-check-repair.yml');

        expect(repair.on.workflow_run.workflows).toContain(readWorkflow('pr-baseline.yml').name);
    });
});
