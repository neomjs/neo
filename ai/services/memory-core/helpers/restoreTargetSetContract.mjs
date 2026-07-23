import {createHash} from 'crypto';

/**
 * @module ai/services/memory-core/helpers/restoreTargetSetContract
 * @summary Canonical v1 identity contract for the `restore-empty-target`
 * Memory Core recovery unit.
 *
 * A recovery-unit key deliberately excludes the admitted bundle, so swapping
 * bundles cannot evade cooldown. The attempt fingerprint adds both admitted
 * source fingerprints and therefore owns idempotent crash resume.
 */

export const RESTORE_EMPTY_TARGET_ACTION = 'restore-empty-target';
export const RESTORE_TARGET_SET_VERSION  = 1;

export const RESTORE_TARGET_ROLES = Object.freeze([
    'memories',
    'summaries',
    'graph'
]);

const DESTINATION_KINDS = Object.freeze({
    memories : 'chroma',
    summaries: 'chroma',
    graph    : 'sqlite-graph'
});

/**
 * @summary Builds the canonical v1 descriptor and derives its topology
 * fingerprint.
 *
 * @param {Object} options
 * @param {String} options.memoriesCollection Configured memories collection.
 * @param {String} options.summariesCollection Configured summaries collection.
 * @param {String} options.graphDestination Configured SQLite graph identity.
 * @param {String} options.bundleManifestFingerprint Admitted bundle manifest SHA-256.
 * @param {String} options.admissionDescriptorFingerprint Provider-free admission descriptor SHA-256.
 * @returns {Object} Canonical descriptor.
 */
export function createRestoreTargetSetDescriptor({
    memoriesCollection,
    summariesCollection,
    graphDestination,
    bundleManifestFingerprint,
    admissionDescriptorFingerprint
} = {}) {
    const destinations = [
        {role: 'memories',  kind: DESTINATION_KINDS.memories,  id: memoriesCollection},
        {role: 'summaries', kind: DESTINATION_KINDS.summaries, id: summariesCollection},
        {role: 'graph',     kind: DESTINATION_KINDS.graph,     id: graphDestination}
    ];

    validateDestinations(destinations);
    validateFingerprint(bundleManifestFingerprint, 'bundleManifestFingerprint');
    validateFingerprint(admissionDescriptorFingerprint, 'admissionDescriptorFingerprint');

    return {
        version                       : RESTORE_TARGET_SET_VERSION,
        destinations,
        destinationTopologyFingerprint: fingerprintCanonical({
            version: RESTORE_TARGET_SET_VERSION,
            destinations
        }),
        bundleManifestFingerprint,
        admissionDescriptorFingerprint
    }
}

/**
 * @summary Validates and detaches an externally supplied target-set descriptor.
 *
 * The ordered roles and kinds are closed in v1. A topology fingerprint is
 * recomputed rather than trusted, and source fingerprints must be SHA-256.
 *
 * @param {Object} descriptor Candidate descriptor.
 * @returns {Object} Canonical detached descriptor.
 */
export function normalizeRestoreTargetSetDescriptor(descriptor = {}) {
    if (descriptor.version !== RESTORE_TARGET_SET_VERSION) {
        throw new Error(`restore target-set version must be ${RESTORE_TARGET_SET_VERSION}`)
    }

    const destinations = Array.isArray(descriptor.destinations)
        ? descriptor.destinations.map(destination => ({
            role: destination?.role,
            kind: destination?.kind,
            id  : destination?.id
        }))
        : [];

    validateDestinations(destinations);
    validateFingerprint(descriptor.bundleManifestFingerprint, 'bundleManifestFingerprint');
    validateFingerprint(descriptor.admissionDescriptorFingerprint, 'admissionDescriptorFingerprint');
    validateFingerprint(descriptor.destinationTopologyFingerprint, 'destinationTopologyFingerprint');

    const expectedTopologyFingerprint = fingerprintCanonical({
        version: RESTORE_TARGET_SET_VERSION,
        destinations
    });

    if (descriptor.destinationTopologyFingerprint !== expectedTopologyFingerprint) {
        throw new Error('restore target-set destinationTopologyFingerprint does not match its ordered destinations')
    }

    return {
        version                       : RESTORE_TARGET_SET_VERSION,
        destinations,
        destinationTopologyFingerprint: expectedTopologyFingerprint,
        bundleManifestFingerprint     : descriptor.bundleManifestFingerprint,
        admissionDescriptorFingerprint: descriptor.admissionDescriptorFingerprint
    }
}

/**
 * @summary Derives the bundle-independent recovery-unit key and the
 * bundle-specific attempt fingerprint.
 *
 * @param {Object} descriptor Candidate target-set descriptor.
 * @returns {{descriptor: Object, recoveryUnitKey: String, attemptFingerprint: String}}
 */
export function deriveRestoreTargetSetIdentity(descriptor) {
    const normalized = normalizeRestoreTargetSetDescriptor(descriptor);

    const recoveryUnitKey = `${RESTORE_EMPTY_TARGET_ACTION}:v${RESTORE_TARGET_SET_VERSION}:${
        fingerprintCanonical({
            action                        : RESTORE_EMPTY_TARGET_ACTION,
            version                       : normalized.version,
            destinations                  : normalized.destinations,
            destinationTopologyFingerprint: normalized.destinationTopologyFingerprint
        }).slice('sha256:'.length)
    }`;

    const attemptFingerprint = fingerprintCanonical({
        recoveryUnitKey,
        bundleManifestFingerprint     : normalized.bundleManifestFingerprint,
        admissionDescriptorFingerprint: normalized.admissionDescriptorFingerprint
    });

    return {
        descriptor: normalized,
        recoveryUnitKey,
        attemptFingerprint
    }
}

/**
 * @summary Creates a stable SHA-256 over a recursively key-sorted JSON value.
 *
 * @param {*} value JSON-compatible value.
 * @returns {String} `sha256:<hex>`.
 */
export function fingerprintCanonical(value) {
    return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function validateDestinations(destinations) {
    if (destinations.length !== RESTORE_TARGET_ROLES.length) {
        throw new Error(`restore target-set requires exactly ${RESTORE_TARGET_ROLES.length} ordered destinations`)
    }

    destinations.forEach((destination, index) => {
        const expectedRole = RESTORE_TARGET_ROLES[index];

        if (destination.role !== expectedRole) {
            throw new Error(`restore target-set destination ${index} must have role '${expectedRole}'`)
        }
        if (destination.kind !== DESTINATION_KINDS[expectedRole]) {
            throw new Error(`restore target-set '${expectedRole}' destination must have kind '${DESTINATION_KINDS[expectedRole]}'`)
        }
        if (typeof destination.id !== 'string' || destination.id.length === 0) {
            throw new Error(`restore target-set '${expectedRole}' destination requires a non-empty id`)
        }
    })
}

function validateFingerprint(value, name) {
    if (!/^sha256:[0-9a-f]{64}$/i.test(value ?? '')) {
        throw new Error(`restore target-set ${name} must be a sha256:<64-hex> fingerprint`)
    }
}

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}
