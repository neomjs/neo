import {setup} from '../../../../../setup.mjs';

const appName = 'HealthcheckBackupDetailsTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * The human-readable backup line in a composed healthcheck must be a RENDERING of the maintenance
 * verdict's reason codes, never a second producer of them.
 *
 * Operators and agents read this sentence rather than the structured block, so a wording assembled
 * beside the codes instead of from them would let the prose outlive a corrected verdict: the surface
 * would keep asserting a finding the scorer no longer makes, and correcting the scorer would leave
 * the reader's experience untouched.
 *
 * The arms assert derivation in both directions — codes reach the prose verbatim, and a code absent
 * from the verdict appears nowhere in any rendered line.
 */

const
    // Minimal composer inputs. Only the backup arm is exercised; every other degradation source is
    // held quiet so a detail line can originate from exactly one place.
    baseArgs = reasonCodes => ({
        health              : {status: 'healthy', details: []},
        memoryWalDrain      : {state: 'caught-up', pendingDrainDepth: 0, oldestPendingAgeMs: null, stallThresholdMs: 1},
        plane               : {id: 'test-plane', dataRoot: '/tmp/test-plane'},
        deploymentInspection: {
            ok      : true,
            status  : 'available',
            snapshot: {maintenance: {health: {status: 'degraded', reasonCodes, staleAfterMs: null}}}
        }
    }),

    backupDetailOf = composed => (composed.details || []).find(line => line.startsWith('Backup maintenance is degraded:')),

    compose = async reasonCodes => {
        const {composeMemoryCoreHealthcheck} = await import(
            '../../../../../../../ai/mcp/server/memory-core/toolService.mjs'
        );

        return composeMemoryCoreHealthcheck(baseArgs(reasonCodes))
    };

test.describe('memory-core healthcheck — the backup detail line derives from the verdict', () => {
    test('the rendered sentence is the verdict\'s reason codes, verbatim and in order', async () => {
        expect(backupDetailOf(await compose(['backup-retry-exhausted', 'backup-state-conflict']))).toBe(
            'Backup maintenance is degraded: backup-retry-exhausted, backup-state-conflict.'
        );
    });

    // The derivation arm proper: change the verdict, the prose must change with it. Reddens if any
    // detail line is ever built from something other than the verdict's reason codes.
    test('mutating the verdict mutates the prose', async () => {
        const
            conflict = backupDetailOf(await compose(['backup-state-conflict'])),
            negative = backupDetailOf(await compose(['backup-never-succeeded']));

        expect(conflict).toBe('Backup maintenance is degraded: backup-state-conflict.');
        expect(negative).toBe('Backup maintenance is degraded: backup-never-succeeded.');
        expect(conflict).not.toBe(negative);
    });

    // NO INDEPENDENT EMISSION PATH. This is the arm that catches a corrected scorer whose old
    // finding survives in the prose: with the definite negative absent from the verdict, it must be
    // absent from every rendered line — not merely from the backup line.
    test('a code absent from the verdict appears nowhere in details', async () => {
        const composed = await compose(['backup-retry-exhausted', 'backup-state-conflict']);

        expect(composed.details.join('\n')).not.toContain('backup-never-succeeded');
    });

    // Guards the fallback branch rather than assuming it never fires: a degraded verdict naming no
    // reason is still a real state, and the reader needs a pointer rather than a bare accusation.
    test('an empty reason-code list falls back to a pointer, not to a bare sentence', async () => {
        expect(backupDetailOf(await compose([]))).toBe(
            'Backup maintenance is degraded: see maintenance.backup.'
        );
    });
});
