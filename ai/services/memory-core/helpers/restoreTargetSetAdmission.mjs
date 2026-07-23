import {createHash} from 'node:crypto';
import fs           from 'node:fs';
import readline     from 'node:readline';

import {fingerprintCanonical}    from './restoreTargetSetContract.mjs';
import {validateJsonlSourceFile} from './vectorJsonlSourceValidation.mjs';

/**
 * @module ai/services/memory-core/helpers/restoreTargetSetAdmission
 * @summary Provider-free, full-source admission for one v1
 * `restore-empty-target` bundle slice.
 *
 * Admission is intentionally detached from mutation. It streams every source,
 * validates every vector row and the graph envelope, and fingerprints the exact
 * files. The actuator re-checks these
 * fingerprints before staging so a post-admission source swap fails closed.
 */

export const RESTORE_TARGET_SET_ADMISSION_VERSION = 1;

/**
 * @summary Fully admits the three files consumed by target-set recovery.
 *
 * @param {Object} options
 * @param {String} options.bundleManifestPath Admitted bundle manifest file.
 * @param {String} options.memoriesFile Memories JSONL.
 * @param {String} options.summariesFile Summaries JSONL.
 * @param {String} options.graphFile Graph JSONL.
 * @param {Number} options.expectedDimension Configured vector dimension.
 * @returns {Promise<Object>} Detached admission descriptor.
 */
export async function admitRestoreTargetSetBundle({
    bundleManifestPath,
    memoriesFile,
    summariesFile,
    graphFile,
    expectedDimension
} = {}) {
    validateExpectedDimension(expectedDimension);
    validateFilePath(bundleManifestPath, 'bundleManifestPath');
    validateFilePath(memoriesFile, 'memoriesFile');
    validateFilePath(summariesFile, 'summariesFile');
    validateFilePath(graphFile, 'graphFile');

    const [
        bundleManifestFingerprint,
        memories,
        summaries,
        graph
    ] = await Promise.all([
        fingerprintFile(bundleManifestPath),
        inspectVectorFile({filePath: memoriesFile, expectedDimension}),
        inspectVectorFile({filePath: summariesFile, expectedDimension}),
        inspectGraphFile(graphFile)
    ]);

    const components = {
        memories: {
            fileFingerprint: memories.fileFingerprint,
            rowCount       : memories.rowCount
        },
        summaries: {
            fileFingerprint: summaries.fileFingerprint,
            rowCount       : summaries.rowCount
        },
        graph: {
            fileFingerprint  : graph.fileFingerprint,
            rowCount         : graph.rowCount,
            nodeCount        : graph.nodeCount,
            edgeCount        : graph.edgeCount,
            recordFingerprint: graph.recordFingerprint
        }
    };

    const descriptorFingerprint = fingerprintAdmissionDescriptor({
        expectedDimension,
        components
    });

    return {
        schemaVersion: RESTORE_TARGET_SET_ADMISSION_VERSION,
        status       : 'admitted',
        bundleManifestFingerprint,
        descriptorFingerprint,
        expectedDimension,
        components   : {
            memories : {...components.memories, filePath: memoriesFile},
            summaries: {...components.summaries, filePath: summariesFile},
            graph    : {...components.graph, filePath: graphFile}
        }
    }
}

/**
 * @summary Validates and detaches a request-carried admission descriptor.
 *
 * @param {Object} admission Candidate admission.
 * @param {Object} targetDescriptor Canonical target-set descriptor.
 * @returns {Object} Detached normalized admission.
 */
export function normalizeRestoreTargetSetAdmission(admission, targetDescriptor) {
    if (admission?.schemaVersion !== RESTORE_TARGET_SET_ADMISSION_VERSION ||
        admission?.status !== 'admitted') {
        throw new Error('restore target-set requires a v1 admitted source descriptor')
    }

    validateExpectedDimension(admission.expectedDimension);

    const components = {};

    for (const role of ['memories', 'summaries', 'graph']) {
        const component = admission.components?.[role];
        validateFilePath(component?.filePath, `${role}.filePath`);
        validateFingerprint(component?.fileFingerprint, `${role}.fileFingerprint`);
        validateCount(component?.rowCount, `${role}.rowCount`);

        components[role] = {
            filePath       : component.filePath,
            fileFingerprint: component.fileFingerprint,
            rowCount       : component.rowCount
        };

        if (role === 'graph') {
            validateCount(component.nodeCount, 'graph.nodeCount');
            validateCount(component.edgeCount, 'graph.edgeCount');
            validateFingerprint(component.recordFingerprint, 'graph.recordFingerprint');
            components.graph.nodeCount         = component.nodeCount;
            components.graph.edgeCount         = component.edgeCount;
            components.graph.recordFingerprint = component.recordFingerprint
        }
    }

    validateFingerprint(admission.bundleManifestFingerprint, 'bundleManifestFingerprint');
    validateFingerprint(admission.descriptorFingerprint, 'descriptorFingerprint');

    const expectedDescriptorFingerprint = fingerprintAdmissionDescriptor({
        expectedDimension: admission.expectedDimension,
        components
    });

    if (admission.descriptorFingerprint !== expectedDescriptorFingerprint) {
        throw new Error('restore target-set admission descriptor fingerprint mismatch')
    }
    if (targetDescriptor?.bundleManifestFingerprint !== admission.bundleManifestFingerprint) {
        throw new Error('restore target-set bundle manifest fingerprint does not match admission')
    }
    if (targetDescriptor?.admissionDescriptorFingerprint !== admission.descriptorFingerprint) {
        throw new Error('restore target-set descriptor fingerprint does not match admission')
    }

    return {
        schemaVersion            : RESTORE_TARGET_SET_ADMISSION_VERSION,
        status                   : 'admitted',
        bundleManifestFingerprint: admission.bundleManifestFingerprint,
        descriptorFingerprint    : admission.descriptorFingerprint,
        expectedDimension        : admission.expectedDimension,
        components
    }
}

/**
 * @summary Recomputes a file SHA-256 for action-time source immutability proof.
 *
 * @param {String} filePath Source file.
 * @returns {Promise<String>} `sha256:<hex>`.
 */
export function fingerprintRestoreSourceFile(filePath) {
    validateFilePath(filePath, 'filePath');
    return fingerprintFile(filePath)
}

async function inspectVectorFile({filePath, expectedDimension}) {
    const [{rowCount}, fileFingerprint] = await Promise.all([
        validateJsonlSourceFile({filePath, expectedDimension, vectorRows: true}),
        fingerprintFile(filePath)
    ]);

    return {rowCount, fileFingerprint}
}

async function inspectGraphFile(filePath) {
    const
        input = fs.createReadStream(filePath, {encoding: 'utf8'}),
        lines = readline.createInterface({input, crlfDelay: Infinity}),
        nodes = [],
        edges = [];

    let lineNumber = 0;

    try {
        for await (const line of lines) {
            if (!line.trim()) {
                continue
            }

            lineNumber++;

            let record;
            try {
                record = JSON.parse(line)
            } catch (error) {
                throw new Error(`restore graph source line ${lineNumber} is invalid JSON: ${error.message}`)
            }

            validateGraphRecord(record, lineNumber);
            const canonical = canonicalJson(record.data);

            if (record.type === 'node') {
                nodes.push(canonical)
            } else {
                edges.push(canonical)
            }
        }
    } finally {
        lines.close();
        input.destroy()
    }

    return {
        fileFingerprint  : await fingerprintFile(filePath),
        rowCount         : nodes.length + edges.length,
        nodeCount        : nodes.length,
        edgeCount        : edges.length,
        recordFingerprint: fingerprintCanonical({
            nodes: nodes.sort(),
            edges: edges.sort()
        })
    }
}

function validateGraphRecord(record, lineNumber) {
    if (!record || !['node', 'edge'].includes(record.type) ||
        !record.data || typeof record.data !== 'object') {
        throw new Error(`restore graph source line ${lineNumber} must be a node/edge envelope`)
    }
    if (record.type === 'node' && (
        typeof record.data.id !== 'string' || record.data.id.length === 0
    )) {
        throw new Error(`restore graph source line ${lineNumber} node requires id`)
    }
    if (record.type === 'edge') {
        for (const key of ['source', 'target', 'type']) {
            if (typeof record.data[key] !== 'string' || record.data[key].length === 0) {
                throw new Error(`restore graph source line ${lineNumber} edge requires ${key}`)
            }
        }
    }
}

function fingerprintAdmissionDescriptor({expectedDimension, components}) {
    return fingerprintCanonical({
        schemaVersion: RESTORE_TARGET_SET_ADMISSION_VERSION,
        expectedDimension,
        components   : {
            memories: {
                fileFingerprint: components.memories.fileFingerprint,
                rowCount       : components.memories.rowCount
            },
            summaries: {
                fileFingerprint: components.summaries.fileFingerprint,
                rowCount       : components.summaries.rowCount
            },
            graph: {
                fileFingerprint  : components.graph.fileFingerprint,
                rowCount         : components.graph.rowCount,
                nodeCount        : components.graph.nodeCount,
                edgeCount        : components.graph.edgeCount,
                recordFingerprint: components.graph.recordFingerprint
            }
        }
    })
}

function fingerprintFile(filePath) {
    return new Promise((resolve, reject) => {
        const
            hash  = createHash('sha256'),
            input = fs.createReadStream(filePath);

        input.on('data', chunk => hash.update(chunk));
        input.on('error', reject);
        input.on('end', () => resolve(`sha256:${hash.digest('hex')}`))
    })
}

function validateExpectedDimension(value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError('restore target-set expectedDimension must be a positive integer')
    }
}

function validateFilePath(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`restore target-set ${name} is required`)
    }
}

function validateFingerprint(value, name) {
    if (!/^sha256:[0-9a-f]{64}$/i.test(value ?? '')) {
        throw new TypeError(`restore target-set ${name} must be a sha256:<64-hex> fingerprint`)
    }
}

function validateCount(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`restore target-set ${name} must be a non-negative integer`)
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
