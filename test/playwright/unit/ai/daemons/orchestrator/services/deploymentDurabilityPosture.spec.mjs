import {readFileSync}              from 'node:fs';
import {test, expect}              from '@playwright/test';
import {validateOffHostSyncConfig} from '../../../../../../../ai/scripts/maintenance/offHostSync.mjs';
import {
    DURABILITY_POSTURES,
    MAX_POSTURE_REASON_LENGTH,
    resolveCloudOnlyDefault,
    resolveDurabilityPosture
} from '../../../../../../../ai/daemons/orchestrator/services/deploymentDurabilityPosture.mjs';

const
    CONFIG_BASE_PATH  = new URL('../../../../../../../ai/configBase.mjs', import.meta.url),
    ORCHESTRATOR_PATH = new URL('../../../../../../../ai/daemons/orchestrator/Orchestrator.mjs', import.meta.url),
    PARITY_PATH       = new URL('../../../../../../../ai/scripts/lint/config-leaf-parity.json', import.meta.url),
    BRIDGE_PATH       = new URL('../../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs', import.meta.url);

/**
 * Resolves a posture from a raw `offHostSync` config subtree, routing it through the contract owner's
 * validator exactly as the production caller does. Tests must not hand-roll the enablement predicate,
 * or they would certify a second implementation rather than the shipped one.
 * @param {Object} options
 * @returns {Object}
 */
function posture({deploymentMode, offHostBackupRequired = null, offHostSync = {}}) {
    return resolveDurabilityPosture({
        deploymentMode,
        offHostBackupRequired,
        validationOutcome: validateOffHostSyncConfig(offHostSync)
    })
}

test.describe('off-host durability posture (#16055)', () => {

    test('POSITIVE CONTROL: the validator this derivation depends on actually discriminates', () => {
        // Without this, every posture assertion below could pass against a validator that returns a
        // constant. A configured command must read enabled, an empty one must not, and a malformed
        // argv token must surface an error — if any of these three collapse, the postures are
        // measuring nothing and the rest of this file is decoration.
        expect(validateOffHostSyncConfig({command: 'rclone'}).enabled).toBe(true);
        expect(validateOffHostSyncConfig({}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({}).error).toBe(null);

        const malformed = validateOffHostSyncConfig({command: 'rclone', argv: ['x{bundleDir}y']});

        expect(malformed.enabled).toBe(false);
        expect(malformed.error).toBeTruthy()
    });

    test('a cloud deployment with no off-host command is UNMET, not benign', () => {
        // The incident state. Previously this deployment reported `offHostSync.status: 'disabled'`
        // and nothing else — a value that reads as a settled configuration choice.
        const result = posture({deploymentMode: 'cloud'});

        expect(result.posture).toBe('unmet');
        expect(result.cloudDeployment).toBe(true);
        expect(result.offHostBackupRequired).toBe(true);
        expect(result.offHostSyncConfigured).toBe(false);
        expect(result.reason).toContain('failure domain')
    });

    test('a deliberate opt-out is DISTINGUISHABLE from an unnoticed gap', () => {
        // The whole point of the requirement leaf. Both states have no sync command and both are
        // "not going to sync"; only one of them was a decision. A posture that returned the same
        // value for both would be unable to tell a considered trade-off from an oversight.
        const optedOut = posture({deploymentMode: 'cloud', offHostBackupRequired: false}),
              unmet    = posture({deploymentMode: 'cloud', offHostBackupRequired: null});

        expect(optedOut.posture).toBe('opted-out');
        expect(unmet.posture).toBe('unmet');
        expect(optedOut.posture).not.toBe(unmet.posture);
        expect(optedOut.offHostSyncConfigured).toBe(unmet.offHostSyncConfigured)
    });

    test('the local profile does not require off-host backup, and can opt in', () => {
        expect(posture({deploymentMode: 'local'}).posture).toBe('not-required');
        expect(posture({deploymentMode: 'local', offHostBackupRequired: true}).posture).toBe('unmet')
    });

    test('a configured command reports `configured` and never claims the sync SUCCEEDED', () => {
        const result = posture({deploymentMode: 'cloud', offHostSync: {command: 'rclone', argv: ['copy', '{bundleDir}']}});

        expect(result.posture).toBe('configured');
        expect(result.offHostSyncConfigured).toBe(true);
        // `configured` attests intent only. The outcome lives on the backup receipt, and this field
        // must not be readable as an attestation the config layer cannot make.
        expect(DURABILITY_POSTURES).not.toContain('satisfied');
        expect(result.reason).toContain('receipt')
    });

    test('a configured-but-INVALID hook does not masquerade as configured', () => {
        // A malformed command will never run, so reporting it as configured would reproduce exactly
        // the wrong-subject failure this posture exists to remove.
        const result = posture({
            deploymentMode: 'cloud',
            offHostSync   : {command: 'rclone', argv: ['x{bundleDir}y']}
        });

        expect(result.posture).toBe('unmet');
        expect(result.offHostSyncConfigured).toBe(false);
        expect(result.offHostSyncConfigValid).toBe(false);
        expect(result.reason).toContain('invalid')
    });

    test('an invalid hook is still reported when the deployment does not require off-host backup', () => {
        const result = posture({deploymentMode: 'local', offHostSync: {command: 'rclone', argv: ['x{bundleDir}y']}});

        expect(result.offHostSyncConfigValid).toBe(false);
        expect(result.posture).toBe('not-required')
    });

    test('every posture the derivation can emit is inside the declared set', () => {
        const emitted = new Set();

        for (const deploymentMode of ['cloud', 'local', 'unset']) {
            for (const offHostBackupRequired of [null, true, false]) {
                for (const offHostSync of [{}, {command: 'aws'}, {command: 'aws', argv: ['x{bundleName}y']}, {timeoutMs: 1}]) {
                    emitted.add(posture({deploymentMode, offHostBackupRequired, offHostSync}).posture)
                }
            }
        }

        expect(emitted.size).toBeGreaterThan(1);
        for (const value of emitted) expect(DURABILITY_POSTURES).toContain(value)
    });

    test('the reason is bounded, so a pathological config cannot inflate the snapshot', () => {
        const result = posture({
            deploymentMode: 'cloud',
            offHostSync   : {command: 'rclone', argv: [`${'z'.repeat(4096)}{bundleDir}tail`]}
        });

        expect(result.offHostSyncConfigValid).toBe(false);
        expect(result.reason.length).toBeLessThanOrEqual(MAX_POSTURE_REASON_LENGTH)
    });

    test('the tri-state gate keeps ONE home — Orchestrator delegates rather than restating the rule', () => {
        // Two copies of "null means cloud" can drift, and the drift would be silent: each side would
        // look correct in isolation while a deployment resolved one gate enabled and the other not.
        const source = readFileSync(ORCHESTRATOR_PATH, 'utf8');

        expect(source).toContain("import {resolveCloudOnlyDefault} from './services/deploymentDurabilityPosture.mjs'");
        expect(source).toContain('return resolveCloudOnlyDefault(AiConfig.orchestrator.cloudOnly[key], AiConfig.orchestrator.deploymentMode)');

        expect(resolveCloudOnlyDefault(null,  'cloud')).toBe(true);
        expect(resolveCloudOnlyDefault(null,  'local')).toBe(false);
        expect(resolveCloudOnlyDefault(false, 'cloud')).toBe(false);
        expect(resolveCloudOnlyDefault(true,  'local')).toBe(true)
    });

    test('the requirement is a real leaf with an env binding AND a parity-manifest entry', () => {
        // AC1 asks for all three in one commit. The parity gate is what makes the manifest half
        // load-bearing: a declared path missing from the snapshot fails the build.
        const configBase = readFileSync(CONFIG_BASE_PATH, 'utf8'),
              parity     = JSON.parse(readFileSync(PARITY_PATH, 'utf8'));

        expect(configBase).toContain("offHostBackupRequired: leaf(null, 'NEO_ORCHESTRATOR_OFF_HOST_BACKUP_REQUIRED', 'boolean')");
        expect(parity['ai/config.template.mjs']).toContain('orchestrator.cloudOnly.offHostBackupRequired')
    });

    test('the bridge projects the posture even when no backup receipt exists', () => {
        // The structural half of the fix: a posture is a property of CONFIG, so it is knowable before
        // any backup has run — which is precisely the deployment most at risk. The previous
        // `return null` omitted the entire maintenance section for that case.
        const source = readFileSync(BRIDGE_PATH, 'utf8');

        expect(source).toContain("if (outcome.status === 'missing') return {durability};");
        expect(source).not.toContain("if (outcome.status === 'missing') return null;")
    });

    test('`unreadable` is in the declared set because a caller can emit it', () => {
        // An enum omitting a value its own producers write is a false completeness claim: a consumer
        // validating against it would reject a legitimate snapshot.
        const source = readFileSync(BRIDGE_PATH, 'utf8');

        expect(source).toContain("posture: 'unreadable'");
        expect(DURABILITY_POSTURES).toContain('unreadable')
    })
});
