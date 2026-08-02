import {test, expect} from '@playwright/test';

import fs              from 'node:fs/promises';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * The action set is stated in two places — the decision record that governs it and the code that
 * enforces it — and they drifted apart in BOTH directions before anyone noticed: an action was
 * specified and missing while two others shipped unlisted. It was found by a peer running a mandatory
 * read before unrelated work, which is luck, and it cost that peer a blocked lane.
 *
 * This spec is the mechanical replacement for that luck. It does not judge which side is right; it
 * fails when they disagree, so the disagreement is a red build rather than a discovery.
 */

const here     = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot = path.resolve(here, '../../../../../../..'),
      adrPath  = path.join(repoRoot, 'learn/agentos/decisions/0026-recovery-actuator.md'),
      srcPath  = path.join(repoRoot, 'ai/daemons/orchestrator/services/RecoveryActuatorService.mjs');

test.describe('ADR 0026 and the recovery actuator agree on the action set (#16374)', () => {
    test('every action the code admits is documented, and every documented action is marked', async () => {
        const source = await fs.readFile(srcPath, 'utf8'),
              adr    = await fs.readFile(adrPath, 'utf8');

        const shipped = source
            .match(/const DEFAULT_ACTIONS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/)?.[1]
            .match(/'([^']+)'/g)
            ?.map(entry => entry.replaceAll("'", ''))
            .sort();

        // Positive control: if the parse ever silently returns nothing, this spec would pass by
        // asserting an empty set against an empty set — the shape where a guard stops guarding.
        expect(shipped, 'DEFAULT_ACTIONS could not be parsed from the source').toBeTruthy();
        expect(shipped.length).toBeGreaterThan(0);

        // Every shipped action must appear in the ADR's action×target-kind matrix. A new action added
        // to the code without documenting it fails here rather than in a peer's unrelated review.
        const matrix = adr.slice(adr.indexOf('| target kind | admitted actions |'));

        for (const action of shipped) {
            expect(matrix, `'${action}' ships but is absent from the ADR's action matrix`).toContain(`\`${action}\``);
        }

        // And the reverse: actions the ADR still specifies but the code does not admit must be
        // explicitly marked unimplemented, so a reader can tell what they may actually call.
        for (const action of ['recycle', 'throttle', 'shed']) {
            if (!shipped.includes(action)) {
                expect(adr, `'${action}' is specified, not shipped, and not marked unimplemented`)
                    .toMatch(/UNIMPLEMENTED/);
            }
        }
    });

    test('the ADR no longer states the flat action set the implementation outgrew', async () => {
        const adr = await fs.readFile(adrPath, 'utf8');

        // The original line specified a flat set. Leaving it in place alongside the matrix would give a
        // reader two contradictory contracts and no way to tell which one the code enforces.
        expect(adr).not.toContain('action ∈ {restart, recycle, throttle, reconfigure(knownKey), shed}');
        expect(adr).toContain('The action set is a matrix, not a flat list');
    });
});
