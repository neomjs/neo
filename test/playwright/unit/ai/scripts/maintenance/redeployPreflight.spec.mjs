import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';
import fsExtra        from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {
    evaluateRedeployPreconditions as evaluateRawRedeployPreconditions,
    INITIALIZATION_MARKER_FILENAME,
    observePrimaryStoreVolume,
    PRIMARY_STORE_VOLUME_NAME,
    PRIMARY_VOLUME_STATE,
    readInitializationMarker,
    REDEPLOY_PREFLIGHT_DECISION,
    runRedeployPreflight
} from '../../../../../../ai/scripts/maintenance/redeployPreflight.mjs';

const DEPLOY_SCRIPT = new URL('../../../../../../ai/examples/cloud-deployment/deploy-pipeline.sh', import.meta.url);

const silent = {error: () => {}, log: () => {}, warn: () => {}};

/**
 * @summary Supplies the split probe facts older truth-table fixtures collapsed into one code.
 * @param {Object} options Truth-table inputs.
 * @returns {Object}
 */
const evaluateRedeployPreconditions = options => {
    const authorized = options.verdictCode === 'RESTORABLE';

    return evaluateRawRedeployPreconditions({
        emptySubsystems         : authorized ? [] : null,
        priorStateEvidence      : authorized,
        recoverySourceAuthorized: authorized,
        ...options
    })
};

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
                primaryVolumeState : PRIMARY_VOLUME_STATE.ABSENT,
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
                primaryVolumeState : PRIMARY_VOLUME_STATE.UNKNOWN,
                verdictCode
            });

            expect(outcome.proceed).toBe(false);
            expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
        }
    });

    test('--initialize refuses when a restorable bundle proves prior deployment without a marker', () => {
        const outcome = evaluateRedeployPreconditions({
            initializeRequested: true,
            markerPresent      : false,
            primaryVolumeState : PRIMARY_VOLUME_STATE.ABSENT,
            verdictCode        : 'RESTORABLE'
        });

        expect(outcome.proceed).toBe(false);
        expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
        expect(outcome.reason).toContain('bundle containing prior-state rows')
    });

    test('--initialize refuses when the independently durable primary-store volume exists', () => {
        const outcome = evaluateRedeployPreconditions({
            initializeRequested: true,
            markerPresent      : false,
            primaryVolumeState : PRIMARY_VOLUME_STATE.PRESENT,
            verdictCode        : 'NO_BUNDLES'
        });

        expect(outcome.proceed).toBe(false);
        expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
        expect(outcome.reason).toContain('primary-store volume')
    });

    test('--initialize gives an unmeasurable plane its own refusal code', () => {
        for (const primaryVolumeState of [null, PRIMARY_VOLUME_STATE.UNKNOWN, 'invalid-state']) {
            const outcome = evaluateRedeployPreconditions({
                initializeRequested: true,
                markerPresent      : false,
                primaryVolumeState,
                verdictCode        : 'NO_BUNDLES'
            });

            expect(outcome.proceed).toBe(false);
            expect(outcome.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_PLANE_STATE_UNKNOWN);
            expect(outcome.writeMarker).toBe(false)
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

    test('#16567 an incomplete bundle blocks redeploy without reopening --initialize', () => {
        const bundleFacts = {
            emptySubsystems         : ['kb'],
            priorStateEvidence      : true,
            recoverySourceAuthorized: false,
            verdictCode             : 'BUNDLE_INCOMPLETE'
        };

        const ordinary = evaluateRedeployPreconditions({
            ...bundleFacts,
            initializeRequested: false,
            markerPresent      : false
        });

        expect(ordinary.proceed).toBe(false);
        expect(ordinary.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_INCOMPLETE_RECOVERY_SOURCE);
        expect(ordinary.reason).toContain('kb');
        expect(ordinary.reason).not.toMatch(/--initialize/);

        // Prior rows still prove that a plane existed. Tightening authorization must not turn an
        // incomplete bundle into permission to initialize over that plane.
        const initialize = evaluateRedeployPreconditions({
            ...bundleFacts,
            initializeRequested: true,
            markerPresent      : false,
            primaryVolumeState : PRIMARY_VOLUME_STATE.ABSENT
        });

        expect(initialize.proceed).toBe(false);
        expect(initialize.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
    });

    test('#16567 incoherent authorization never becomes a deploy or initialization permission', () => {
        const incoherent = {
            emptySubsystems         : null,
            priorStateEvidence      : false,
            recoverySourceAuthorized: true,
            verdictCode             : 'RESTORABLE'
        };

        expect(evaluateRedeployPreconditions({
            ...incoherent,
            initializeRequested: false,
            markerPresent      : false
        }).decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_INCOMPLETE_RECOVERY_SOURCE);

        expect(evaluateRedeployPreconditions({
            ...incoherent,
            initializeRequested: true,
            markerPresent      : false,
            primaryVolumeState : PRIMARY_VOLUME_STATE.ABSENT
        }).decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_ALREADY_INITIALIZED);
    });

    test('every (marker × flag × code) combination resolves to a declared decision', () => {
        // Completeness rather than spot-checks: an unhandled combination would fall through to
        // whatever the last branch happens to be, and the failure would be silent.
        const decisions = new Set();

        for (const markerPresent of [true, false]) {
            for (const initializeRequested of [true, false]) {
                for (const primaryVolumeState of Object.values(PRIMARY_VOLUME_STATE)) {
                    for (const verdictCode of [...REFUSAL_CODES, 'RESTORABLE']) {
                        const outcome = evaluateRedeployPreconditions({
                            initializeRequested,
                            markerPresent,
                            primaryVolumeState,
                            verdictCode
                        });

                        expect(Object.values(REDEPLOY_PREFLIGHT_DECISION)).toContain(outcome.decision);
                        expect(typeof outcome.proceed).toBe('boolean');
                        // A refusal may never authorise a marker write: a refused deploy has to leave the
                        // host exactly as it found it, or the next run reads a deployment that never was.
                        if (!outcome.proceed) expect(outcome.writeMarker).toBe(false);
                        decisions.add(outcome.decision)
                    }
                }
            }
        }

        decisions.add(evaluateRedeployPreconditions({
            emptySubsystems         : ['kb'],
            initializeRequested     : false,
            markerPresent           : false,
            priorStateEvidence      : true,
            recoverySourceAuthorized: false,
            verdictCode             : 'BUNDLE_INCOMPLETE'
        }).decision);

        // All decisions reachable — otherwise the table has dead rows and the coverage above is
        // measuring less than it appears to.
        expect(decisions.size).toBe(Object.keys(REDEPLOY_PREFLIGHT_DECISION).length);
    });
});

test.describe('redeploy preflight — read-only Docker primary-volume observer (#16344)', () => {
    test('zero exact-label matches is a measured absence', async () => {
        const calls  = [],
              result = await observePrimaryStoreVolume({
                  composeProject: 'neo-agent-os',
                  execFileFn(command, args) {
                      calls.push({args, command});

                      return Promise.resolve({stdout: ''})
                  }
              });

        expect(result).toEqual({
            matchCount: 0,
            reason    : 'volume-not-found',
            state     : PRIMARY_VOLUME_STATE.ABSENT
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].command).toBe('docker');
        expect(calls[0].args).toContain(`label=com.docker.compose.project=neo-agent-os`);
        expect(calls[0].args).toContain(`label=com.docker.compose.volume=${PRIMARY_STORE_VOLUME_NAME}`)
    });

    test('one match is present only after its exact Compose labels are verified', async () => {
        const calls  = [],
              result = await observePrimaryStoreVolume({
                  composeProject: 'neo-agent-os',
                  execFileFn(command, args) {
                      calls.push({args, command});

                      return Promise.resolve(args[1] === 'ls'
                          ? {stdout: 'neo-agent-os_shared-sqlite-data\n'}
                          : {stdout: JSON.stringify({
                              'com.docker.compose.project': 'neo-agent-os',
                              'com.docker.compose.volume' : PRIMARY_STORE_VOLUME_NAME
                          })})
                  }
              });

        expect(result).toEqual({
            matchCount: 1,
            reason    : 'volume-labels-verified',
            state     : PRIMARY_VOLUME_STATE.PRESENT,
            volumeName: 'neo-agent-os_shared-sqlite-data'
        });
        expect(calls).toHaveLength(2);
        expect(calls[1].args.slice(0, 4)).toEqual(['volume', 'inspect', '--format', '{{json .Labels}}']);
        // The observer is metadata-only: no container lifecycle or exec verb can appear.
        const argv = calls.flatMap(call => call.args);

        for (const forbidden of ['create', 'exec', 'remove', 'restart', 'run', 'start', 'stop']) {
            expect(argv).not.toContain(forbidden)
        }
    });

    test('multiple exact-label matches stay unknown and are never inspected heuristically', async () => {
        const calls  = [],
              result = await observePrimaryStoreVolume({
                  composeProject: 'neo-agent-os',
                  execFileFn(command, args) {
                      calls.push({args, command});

                      return Promise.resolve({stdout: 'first\nsecond\n'})
                  }
              });

        expect(result).toEqual({
            matchCount: 2,
            reason    : 'volume-match-ambiguous',
            state     : PRIMARY_VOLUME_STATE.UNKNOWN
        });
        expect(calls).toHaveLength(1)
    });

    test('malformed or mismatched labels stay unknown', async () => {
        for (const inspectStdout of [
            'not-json',
            JSON.stringify({'com.docker.compose.project': 'foreign'}),
            JSON.stringify({
                'com.docker.compose.project': 'neo-agent-os',
                'com.docker.compose.volume' : 'chroma-data'
            })
        ]) {
            const result = await observePrimaryStoreVolume({
                composeProject: 'neo-agent-os',
                execFileFn(command, args) {
                    return Promise.resolve(args[1] === 'ls'
                        ? {stdout: 'candidate\n'}
                        : {stdout: inspectStdout})
                }
            });

            expect(result.state).toBe(PRIMARY_VOLUME_STATE.UNKNOWN);
            expect(result.reason).toMatch(/volume-label/)
        }
    });

    test('Docker/socket failure and missing project identity stay unknown', async () => {
        const dockerError = Object.assign(new Error('socket unavailable'), {code: 'ECONNREFUSED'}),
              failed      = await observePrimaryStoreVolume({
                  composeProject: 'neo-agent-os',
                  execFileFn    : async () => { throw dockerError }
              }),
              unscoped    = await observePrimaryStoreVolume();

        expect(failed).toEqual({
            errorCode: 'ECONNREFUSED',
            reason   : 'docker-volume-query-failed',
            state    : PRIMARY_VOLUME_STATE.UNKNOWN
        });
        expect(unscoped).toEqual({
            reason: 'compose-project-unavailable',
            state : PRIMARY_VOLUME_STATE.UNKNOWN
        })
    })
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
        let primaryProbeCalls = 0;

        const backupRoot = path.join(workRoot, 'backups'),
              result     = await runRedeployPreflight({
                  backupRoot,
                  initializeRequested : false,
                  logger              : silent,
                  primaryVolumeProbeFn: async () => {
                      primaryProbeCalls++;

                      return {reason: 'unexpected', state: PRIMARY_VOLUME_STATE.PRESENT}
                  },
                  probeFn: async () => ({
                      code                    : 'NO_BUNDLES',
                      reason                  : 'none',
                      priorStateEvidence      : false,
                      recoverySourceAuthorized: false,
                      restorable              : false
                  })
              });

        expect(result.proceed).toBe(false);
        expect(primaryProbeCalls).toBe(0);
        expect(result.primaryVolumeState).toBeNull();
        expect(await readInitializationMarker({backupRoot})).toBe(false);
    });

    test('#16567 the runner threads both bundle facts into the refusal receipt', async () => {
        const backupRoot = path.join(workRoot, 'backups'),
              result     = await runRedeployPreflight({
                  backupRoot,
                  initializeRequested: false,
                  logger             : silent,
                  probeFn            : async () => ({
                      bundleRoot              : path.join(backupRoot, 'backup-incomplete'),
                      code                    : 'BUNDLE_INCOMPLETE',
                      emptySubsystems         : ['kb'],
                      priorStateEvidence      : true,
                      recoverySourceAuthorized: false,
                      restorable              : false,
                      rowTotal                : 42
                  })
              });

        expect(result.decision).toBe(REDEPLOY_PREFLIGHT_DECISION.REFUSE_INCOMPLETE_RECOVERY_SOURCE);
        expect(result.proceed).toBe(false);
        expect(result.priorStateEvidence).toBe(true);
        expect(result.recoverySourceAuthorized).toBe(false);
        expect(result.emptySubsystems).toEqual(['kb']);
        expect(result.reason).toContain('kb');
        expect(result.reason).not.toMatch(/--initialize/);
        expect(await readInitializationMarker({backupRoot})).toBe(false);
    });

    test('an initializing run records the marker, and the SAME command then refuses', async () => {
        const backupRoot           = path.join(workRoot, 'backups'),
              composeProject       = 'neo-test',
              primaryVolumeProbeFn = async () => ({
                  matchCount: 0,
                  reason    : 'volume-not-found',
                  state     : PRIMARY_VOLUME_STATE.ABSENT
              }),
              probeFn              = async () => ({
                  code                    : 'NO_BUNDLES',
                  reason                  : 'none',
                  priorStateEvidence      : false,
                  recoverySourceAuthorized: false,
                  restorable              : false
              });

        const first = await runRedeployPreflight({
            backupRoot,
            composeProject,
            initializeRequested: true,
            logger             : silent,
            primaryVolumeProbeFn,
            probeFn
        });

        expect(first.proceed).toBe(true);
        expect(first.primaryVolumeState).toBe(PRIMARY_VOLUME_STATE.ABSENT);
        expect(await readInitializationMarker({backupRoot})).toBe(true);

        // Re-running the identical initialization command must now REFUSE. This is the property that
        // stops `--initialize` becoming a habit: it works exactly once per host, and a second use is
        // caught rather than silently repeating a wipe-authorising flag.
        const second = await runRedeployPreflight({
            backupRoot,
            composeProject,
            initializeRequested: true,
            logger             : silent,
            primaryVolumeProbeFn,
            probeFn
        });

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
        // The initialization observer must use the DECLARED identity, never the ordinary-redeploy
        // default: a defaulted project-scoped absence cannot prove this host has no existing plane.
        expect(source).toContain('--initialize --compose-project "$DECLARED_PROJECT_NAME"');
        expect(source).toMatch(/NEO_DEPLOY_PROJECT_NAME must be explicitly declared/);
        // The contract permits metadata observation, but no container lifecycle mutation before the gate.
        expect(source).toMatch(/read-only Docker volume metadata query/);
    })
});
