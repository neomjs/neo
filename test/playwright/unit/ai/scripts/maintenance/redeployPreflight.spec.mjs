import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';
import fsExtra        from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {
    evaluateRedeployPreconditions,
    INITIALIZATION_MARKER_FILENAME,
    readInitializationMarker,
    REDEPLOY_PREFLIGHT_DECISION,
    runRedeployPreflight
} from '../../../../../../ai/scripts/maintenance/redeployPreflight.mjs';

const DEPLOY_SCRIPT = new URL('../../../../../../ai/examples/cloud-deployment/deploy-pipeline.sh', import.meta.url);

const silent = {error: () => {}, log: () => {}, warn: () => {}};

/**
 * Every refusal code the probe can return. Rows 3 and 5 must hold for ALL of them — a gate that
 * refuses on a missing bundle but proceeds on an EMPTY one would have passed the incident.
 * @type {String[]}
 */
const REFUSAL_CODES = ['BUNDLE_ROOT_MISSING', 'NO_BUNDLES', 'BUNDLE_EMPTY', 'BUNDLE_INVALID'];

test.describe('redeploy preflight — the truth table (#16055 AC2/AC3/AC4)', () => {

    test('row 1: declared initialization proceeds, and is the ONLY path that proceeds without a bundle', () => {
        for (const verdictCode of REFUSAL_CODES) {
            const declared = evaluateRedeployPreconditions({
                initializeRequested: true,
                markerPresent      : false,
                verdictCode
            });

            expect(declared.proceed).toBe(true);
            expect(declared.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.PROCEED_INITIALIZING);
            expect(declared.writeMarker).toBe(true);

            // POSITIVE CONTROL on the same input: without the declaration the identical state
            // refuses. If this passed too, the gate would be permitting absence rather than
            // permitting a declaration, and a genuine first install would be indistinguishable from
            // the incident.
            expect(evaluateRedeployPreconditions({
                initializeRequested: false,
                markerPresent      : false,
                verdictCode
            }).proceed).toBe(false);
        }
    });

    test('row 3: an un-declared absence REFUSES for every refusal code, not just a missing root', () => {
        // The gate has to be uniform here. "No bundles" and "an empty bundle that parses" are
        // different codes and the same danger — the incident's own bundle parsed clean and carried
        // nothing, so a gate keyed only on absence would have waved it through.
        for (const verdictCode of REFUSAL_CODES) {
            const outcome = evaluateRedeployPreconditions({
                initializeRequested: false,
                markerPresent      : false,
                verdictCode
            });

            expect(outcome.proceed).toBe(false);
            expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_NO_VERIFIED_BUNDLE);
            expect(outcome.writeMarker).toBe(false);
            // It must tell the operator how to proceed legitimately, or the gate is a wall.
            expect(outcome.reason).toMatch(/--initialize/);
        }
    });

    test('row 4: an ordinary verified redeploy proceeds without rewriting the marker', () => {
        const outcome = evaluateRedeployPreconditions({
            initializeRequested: false,
            markerPresent      : true,
            verdictCode        : 'RESTORABLE'
        });

        expect(outcome.proceed).toBe(true);
        expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.PROCEED_VERIFIED);
        expect(outcome.writeMarker).toBe(false);
    });

    test('row 5: an initialized host with no usable bundle REFUSES — the dangerous case, not the new one', () => {
        for (const verdictCode of REFUSAL_CODES) {
            const outcome = evaluateRedeployPreconditions({
                initializeRequested: false,
                markerPresent      : true,
                verdictCode
            });

            expect(outcome.proceed).toBe(false);
            expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_NO_VERIFIED_BUNDLE);
            // An already-initialized host must NOT be told to pass --initialize; that would be
            // advice to wipe, and row 6 refuses it anyway.
            expect(outcome.reason).not.toMatch(/--initialize/);
        }
    });

    test('row 6: --initialize on an ALREADY-INITIALIZED host is refused — the hatch is not a bypass', () => {
        // The load-bearing safety property. If `--initialize` short-circuited the gate, then every
        // refusal in rows 3 and 5 would be one flag away from proceeding, and an operator hitting a
        // refusal at 2am would reach for exactly that flag.
        for (const verdictCode of [...REFUSAL_CODES, 'RESTORABLE']) {
            const outcome = evaluateRedeployPreconditions({
                initializeRequested: true,
                markerPresent      : true,
                verdictCode
            });

            expect(outcome.proceed).toBe(false);
            expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
        }
    });

    test('row 2: a verified bundle with no marker proceeds AND records the marker', () => {
        // The deliberate recovery path: the bundle proves prior state, so a missing marker is the
        // anomaly rather than the deployment. Without this a host that lost its marker independently
        // of its bundles could never deploy again.
        const outcome = evaluateRedeployPreconditions({
            initializeRequested: false,
            markerPresent      : false,
            verdictCode        : 'RESTORABLE'
        });

        expect(outcome.proceed).toBe(true);
        expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.PROCEED_MARKER_RECOVERED);
        expect(outcome.writeMarker).toBe(true);
    });

    test('every (marker × flag × code) combination resolves to a declared decision', () => {
        // Completeness rather than spot-checks: an unhandled combination would fall through to
        // whatever the last branch happens to be, and the failure would be silent.
        const decisions = new Set();

        for (const markerPresent of [true, false]) {
            for (const initializeRequested of [true, false]) {
                for (const verdictCode of [...REFUSAL_CODES, 'RESTORABLE']) {
                    const outcome = evaluateRedeployPreconditions({initializeRequested, markerPresent, verdictCode});

                    expect(Object.values(REDEPLOY_PREFLIGHT_DECISION)).toContain(outcome.decision);
                    expect(typeof outcome.proceed).toBe('boolean');
                    // A refusal may never authorise a marker write: a refused deploy has to leave the
                    // host exactly as it found it, or the next run reads a deployment that never was.
                    if (!outcome.proceed) expect(outcome.writeMarker).toBe(false);
                    decisions.add(outcome.decision);
                }
            }
        }

        // All five decisions reachable — otherwise the table has dead rows and the coverage above is
        // measuring less than it appears to.
        expect(decisions.size).toBe(Object.keys(REDEPLOY_PREFLIGHT_DECISION).length);
    });
});

test.describe('redeploy preflight — wiring and marker durability (#16055 AC2)', () => {
    let workRoot;

    test.beforeEach(() => {
        workRoot = fsExtra.mkdtempSync(path.join(os.tmpdir(), 'neo-preflight-'));
    });

    test.afterEach(() => {
        fsExtra.removeSync(workRoot);
    });

    test('a refused run writes NO marker, so a later absence stays informative', async () => {
        const backupRoot = path.join(workRoot, 'backups'),
              result     = await runRedeployPreflight({
                  backupRoot,
                  initializeRequested: false,
                  logger             : silent,
                  probeFn            : async () => ({code: 'NO_BUNDLES', reason: 'none', restorable: false})
              });

        expect(result.proceed).toBe(false);
        expect(await readInitializationMarker({backupRoot})).toBe(false);
    });

    test('an initializing run records the marker, and the SAME command then refuses', async () => {
        const backupRoot = path.join(workRoot, 'backups'),
              probeFn    = async () => ({code: 'NO_BUNDLES', reason: 'none', restorable: false});

        const first = await runRedeployPreflight({backupRoot, initializeRequested: true, logger: silent, probeFn});

        expect(first.proceed).toBe(true);
        expect(await readInitializationMarker({backupRoot})).toBe(true);

        // Re-running the identical initialization command must now REFUSE. This is the property that
        // stops `--initialize` becoming a habit: it works exactly once per host, and a second use is
        // caught rather than silently repeating a wipe-authorising flag.
        const second = await runRedeployPreflight({backupRoot, initializeRequested: true, logger: silent, probeFn});

        expect(second.proceed).toBe(false);
        expect(second.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
    });

    test('the marker is a DOTFILE beside the bundles, so bundle enumeration cannot see it', async () => {
        // It has to live on the bind-mount `down -v` spares — that is the whole reason it survives
        // the operation it describes — which means it sits in the directory the probe enumerates.
        // `verifyLatestBackupRestorable` only accepts `backup-*` entries, and this asserts the
        // filename keeps that true rather than trusting it.
        expect(INITIALIZATION_MARKER_FILENAME.startsWith('.')).toBe(true);
        expect(INITIALIZATION_MARKER_FILENAME.startsWith('backup-')).toBe(false);
    });

    test('the reference deploy script gates BEFORE it touches containers', () => {
        // Ordering is the whole guarantee. A preflight that runs after `up -d --build` has already
        // recreated the containers it was meant to protect.
        const source      = readFileSync(DEPLOY_SCRIPT, 'utf8'),
              preflightAt = source.indexOf('redeployPreflight.mjs'),
              composeUpAt = source.indexOf('compose up -d --build');

        expect(preflightAt).toBeGreaterThan(-1);
        expect(composeUpAt).toBeGreaterThan(-1);
        expect(preflightAt).toBeLessThan(composeUpAt);

        // `set -e` is what makes a non-zero preflight abort the job rather than log and continue.
        expect(source).toMatch(/set -euo pipefail/);
        // And the escape hatch has to be reachable, or a genuine first install cannot deploy at all.
        expect(source).toMatch(/NEO_DEPLOY_INITIALIZE/);
    })
});
