import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {execFileSync} from 'node:child_process';

import {
    refusePrescription,
    renderPrescribedEnvironment
} from '../../../../../../../ai/services/memory-core/helpers/deploymentPrescriptionEnvironment.mjs';

/**
 * The effect boundary is the point where the prescription changes what the container is CREATED
 * with — not the point where a ledger records that an action was named. A fixture asserting only
 * that a diagnosis prescribed a ceiling would have passed against `reconfigure` throughout, which
 * is exactly how the original no-op-reporting-success survived to review.
 *
 * `docker compose config` resolves interpolation WITHOUT a reachable daemon, so that boundary is
 * testable here rather than only on a live plane. The compose-backed test skips when the CLI is
 * absent — and skipping is safe only because the render-level tests below stand on their own.
 */

const COMPOSE_RELATIVE = 'ai/deploy/docker-compose.yml';

/**
 * @returns {Boolean} whether `docker compose config` can run in this environment
 */
function composeConfigAvailable() {
    try {
        execFileSync('docker', ['compose', 'version'], {stdio: 'ignore'});
        return true
    } catch {
        return false
    }
}

/**
 * Resolves kb-server's `--max-old-space-size` as Compose would create it.
 * @param {String} repoRoot
 * @returns {Number|null}
 */
function resolvedKbCeiling(repoRoot) {
    const out = execFileSync('docker', ['compose', '-f', COMPOSE_RELATIVE, 'config'], {
        cwd     : repoRoot,
        encoding: 'utf8'
    });

    // kb-server's command line is the first max-old-space-size occurrence in the rendered config.
    const match = out.match(/max-old-space-size=(\d+)/);

    return match ? Number(match[1]) : null
}

test.describe('deployment prescription -> env file', () => {
    test('renders one line per key, sorted and newline-terminated', () => {
        const {content, rendered, refused} = renderPrescribedEnvironment([
            {key: 'NEO_MC_SERVER_HEAP_MB', value: 1536},
            {key: 'NEO_KB_SERVER_HEAP_MB', value: 1024}
        ]);

        expect(content).toBe('NEO_KB_SERVER_HEAP_MB=1024\nNEO_MC_SERVER_HEAP_MB=1536\n');
        expect(rendered).toEqual({NEO_KB_SERVER_HEAP_MB: 1024, NEO_MC_SERVER_HEAP_MB: 1536});
        expect(refused).toEqual([])
    });

    test('an empty ledger renders empty content, never a stray newline', () => {
        expect(renderPrescribedEnvironment([]).content).toBe('');
        expect(renderPrescribedEnvironment(undefined).content).toBe('')
    });

    test('last write wins per key — an append-only ledger raises a ceiling more than once', () => {
        const {content} = renderPrescribedEnvironment([
            {key: 'NEO_KB_SERVER_HEAP_MB', value: 1024},
            {key: 'NEO_KB_SERVER_HEAP_MB', value: 2048}
        ]);

        expect(content).toBe('NEO_KB_SERVER_HEAP_MB=2048\n')
    });

    test('an unchanged ledger renders byte-identical content', () => {
        const ledger = [{key: 'NEO_KB_SERVER_HEAP_MB', value: 1024}];

        expect(renderPrescribedEnvironment(ledger).content)
            .toBe(renderPrescribedEnvironment(ledger).content)
    });

    test('refuses rather than encodes — a mis-encoded line does not fail, it silently delivers the default', () => {
        const {content, refused} = renderPrescribedEnvironment([
            {key: 'neo_kb_server_heap_mb', value: 1024},          // lowercase
            {key: 'NEO_KB_SERVER_HEAP_MB=x', value: 1024},        // embedded separator
            {key: 'NEO KB', value: 1024},                         // whitespace
            {key: 'NEO_KB_SERVER_HEAP_MB', value: 0},             // non-positive
            {key: 'NEO_MC_SERVER_HEAP_MB', value: Number.NaN},    // non-finite
            {key: 'NEO_FLEET_SERVER_HEAP_MB', value: '512'}       // string, not number
        ]);

        expect(content).toBe('');
        expect(refused.map(entry => entry.reason)).toEqual([
            'key-not-an-env-identifier',
            'key-not-an-env-identifier',
            'key-not-an-env-identifier',
            'value-not-a-positive-finite-number',
            'value-not-a-positive-finite-number',
            'value-not-a-positive-finite-number'
        ])
    });

    test('refusePrescription returns null only for a renderable prescription', () => {
        expect(refusePrescription({key: 'NEO_KB_SERVER_HEAP_MB', value: 1024})).toBeNull();
        expect(refusePrescription(undefined)).toBe('key-not-an-env-identifier')
    });

    test('the rendered file changes what the container is CREATED with', () => {
        test.skip(!composeConfigAvailable(), 'docker compose CLI unavailable');

        const
            repoRoot = process.cwd(),
            envPath  = path.join(repoRoot, 'ai/deploy/.env'),
            existed  = fs.existsSync(envPath),
            backup   = existed ? fs.readFileSync(envPath, 'utf8') : null,
            // A value no default in the tree carries, so a pass cannot come from the baseline.
            probeMb  = 4321;

        try {
            const baseline = resolvedKbCeiling(repoRoot);

            expect(baseline, 'the control resolves the compose default before any prescription').not.toBe(probeMb);

            const {content} = renderPrescribedEnvironment([{key: 'NEO_KB_SERVER_HEAP_MB', value: probeMb}]);

            fs.writeFileSync(envPath, content);

            expect(resolvedKbCeiling(repoRoot), 'the prescription reaches the container command')
                .toBe(probeMb)
        } finally {
            if (existed) {
                fs.writeFileSync(envPath, backup)
            } else {
                fs.existsSync(envPath) && fs.unlinkSync(envPath)
            }
        }
    })
});
