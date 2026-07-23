import {test, expect} from '@playwright/test';

import {
    createRestoreTargetSetDescriptor,
    deriveRestoreTargetSetIdentity,
    normalizeRestoreTargetSetDescriptor,
    RESTORE_EMPTY_TARGET_ACTION,
    RESTORE_TARGET_ROLES,
    RESTORE_TARGET_SET_VERSION
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';

const
    BUNDLE_A    = `sha256:${'a'.repeat(64)}`,
    BUNDLE_B    = `sha256:${'b'.repeat(64)}`,
    ADMISSION_A = `sha256:${'c'.repeat(64)}`,
    ADMISSION_B = `sha256:${'d'.repeat(64)}`;

function createDescriptor({
    bundleManifestFingerprint      = BUNDLE_A,
    admissionDescriptorFingerprint = ADMISSION_A
} = {}) {
    return createRestoreTargetSetDescriptor({
        memoriesCollection : 'neo-agent-memory',
        summariesCollection: 'neo-agent-sessions',
        graphDestination   : '/data/graph.sqlite',
        bundleManifestFingerprint,
        admissionDescriptorFingerprint
    })
}

test.describe('restore target-set identity contract', () => {
    test('creates the closed ordered v1 descriptor and verifies its topology fingerprint', () => {
        const descriptor = createDescriptor();

        expect(descriptor).toMatchObject({
            version     : RESTORE_TARGET_SET_VERSION,
            destinations: [
                {role: 'memories',  kind: 'chroma',       id: 'neo-agent-memory'},
                {role: 'summaries', kind: 'chroma',       id: 'neo-agent-sessions'},
                {role: 'graph',     kind: 'sqlite-graph', id: '/data/graph.sqlite'}
            ],
            bundleManifestFingerprint     : BUNDLE_A,
            admissionDescriptorFingerprint: ADMISSION_A
        });
        expect(descriptor.destinations.map(item => item.role)).toEqual(RESTORE_TARGET_ROLES);
        expect(normalizeRestoreTargetSetDescriptor(descriptor)).toEqual(descriptor);
    });

    test('the recovery-unit key is bundle-independent while the attempt fingerprint is bundle-specific', () => {
        const first  = deriveRestoreTargetSetIdentity(createDescriptor());
        const second = deriveRestoreTargetSetIdentity(createDescriptor({
            bundleManifestFingerprint     : BUNDLE_B,
            admissionDescriptorFingerprint: ADMISSION_B
        }));

        expect(first.recoveryUnitKey).toBe(second.recoveryUnitKey);
        expect(first.recoveryUnitKey).toContain(`${RESTORE_EMPTY_TARGET_ACTION}:v1:`);
        expect(first.attemptFingerprint).not.toBe(second.attemptFingerprint);
    });

    test('fails closed on role reordering, topology drift, or non-SHA source fingerprints', () => {
        const reordered = createDescriptor();
        reordered.destinations.reverse();
        expect(() => normalizeRestoreTargetSetDescriptor(reordered)).toThrow(/destination 0/);

        const topologyDrift = createDescriptor();
        topologyDrift.destinations[0].id = 'different-memory';
        expect(() => normalizeRestoreTargetSetDescriptor(topologyDrift)).toThrow(/destinationTopologyFingerprint/);

        expect(() => createRestoreTargetSetDescriptor({
            memoriesCollection            : 'm',
            summariesCollection           : 's',
            graphDestination              : 'g',
            bundleManifestFingerprint     : 'not-a-sha',
            admissionDescriptorFingerprint: ADMISSION_A
        })).toThrow(/bundleManifestFingerprint/);
    });
});
