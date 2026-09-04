import Base              from '../../../core/Base.mjs';
import WorkspaceDocument from './WorkspaceDocument.mjs';

/**
 * @class Neo.dashboard.dock.model.Persistence
 * @extends Neo.core.Base
 *
 * @summary Saved-layout and keyed-topology wire authority: capture, validation, and fail-closed restore.
 *
 * Split out of the former monolithic zone model per the graduated v13.2 DockLayouts
 * architecture: `model.WorkspaceDocument` owns the committed-document contract, `model.Operations`
 * owns the semantic reducer vocabulary, `model.Persistence` owns saved-layout envelopes,
 * and `persistence.PerspectiveLibrary` is the sole collection/perspective authority.
 * Return shape for every operation and envelope helper: `{document|layout|topology|collection, errors}` —
 * fail-closed, the input is never partially mutated.
 */
class Persistence extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.model.Persistence'
         * @protected
         */
        className: 'Neo.dashboard.dock.model.Persistence'
    }

    /**
     * The saved layout wrapper schema around one normalized workspace document. It carries the
     * shape fingerprint and optional perspective name, but no topology mode. One greenfield
     * revision: readers fail closed on every other schema string — no legacy family, no
     * migration reader, no alias survives the v13.2 hard cut.
     * @member {String} LAYOUT_SCHEMA='neo.dock.layout.v1'
     * @static
     */
    static LAYOUT_SCHEMA = 'neo.dock.layout.v1'

    /**
     * Capture choices exposed by callers such as the Neural Link. The choice selects a schema;
     * only `window` is stored on `neo.dock.layout.v1`, while topology records carry no mode field.
     * @member {String[]} CAPTURE_SCOPES
     * @static
     */
    static CAPTURE_SCOPES = ['window', 'topology']

    /**
     * The multi-workspace topology schema. Workspace identity is carried by `workspaces` keys;
     * registration order and runtime window identity never enter the record.
     * @member {String} TOPOLOGY_SCHEMA='neo.dock.topology.v1'
     * @static
     */
    static TOPOLOGY_SCHEMA = 'neo.dock.topology.v1'

    /**
     * The named topology-collection schema. This is deliberately separate from the single-workspace
     * `neo.dock.layoutCollection.v1` library.
     * @member {String} TOPOLOGY_COLLECTION_SCHEMA='neo.dock.topologyCollection.v1'
     * @static
     */
    static TOPOLOGY_COLLECTION_SCHEMA = 'neo.dock.topologyCollection.v1'

    /**
     * Top-level fields allowed in a saved-layout wrapper.
     * @member {Set<String>} savedLayoutKeys
     * @protected
     * @static
     */
    static savedLayoutKeys = new Set([
        'schema', 'layoutId', 'title', 'dockZone', 'metadata', 'revision',
        'captureScope', 'windowFingerprint', 'perspectiveName'
    ])

    /** @protected @static */
    static topologyKeys = new Set([
        'schema', 'layoutId', 'title', 'workspaces', 'placementHints', 'topologyFingerprint',
        'metadata', 'revision', 'perspectiveName'
    ])

    /** @protected @static */
    static topologyCollectionKeys = new Set([
        'schema', 'activeLayoutId', 'topologies', 'metadata', 'revision'
    ])

    /** @protected @static */
    static placementHintKeys = new Set(['dx', 'dy', 'fallbackTarget'])

    /** @protected @static */
    static fallbackTargetKeys = new Set(['workspaceKey', 'nodeId'])

    /** @protected @static */
    static unsafeRecordKeys = new Set(['__proto__', 'constructor', 'prototype'])

    /**
     * @summary Validates the perspective fields shared by the create and restore paths.
     *
     * `windowFingerprint` describes one workspace's topology SHAPE and must be a JSON object or
     * null (never window ids or coordinates — the persistence guardrail); `perspectiveName`, when
     * present, must be a non-empty string. Retired topology fields receive named refusals before
     * the generic finite-schema check so old bytes fail diagnostically rather than ambiguously.
     * @param {Object} layout The saved-layout record carrying the perspective fields.
     * @returns {String[]} Validation errors, empty when the fields are contract-clean.
     * @static
     */
    static validatePerspectiveFields(layout) {
        let errors = [];

        if (layout.captureScope !== 'window') {
            errors.push('captureScope must be "window" on neo.dock.layout.v1; use neo.dock.topology.v1 for multi-workspace state')
        }

        if (Object.hasOwn(layout, 'windowDocuments')) {
            errors.push('windowDocuments is retired; neo.dock.topology.v1 uses keyed workspaces')
        }

        if (layout.windowFingerprint !== null && !WorkspaceDocument.isJsonRecord(layout.windowFingerprint)) {
            errors.push('windowFingerprint must be a JSON object or null')
        }

        if (Object.hasOwn(layout, 'perspectiveName') &&
            (typeof layout.perspectiveName !== 'string' || !layout.perspectiveName.trim())
        ) {
            errors.push('perspectiveName must be a non-empty string when present')
        }

        return errors
    }

    /**
     * @summary Captures a durable multi-workspace topology under stable semantic workspace keys.
     *
     * The input and persisted `workspaces` value are records, never arrays: registration order has
     * no identity meaning. Fingerprints derive from the normalized persisted documents and sort
     * their keys before composition. Placement hints are semantic relative offsets plus a semantic
     * fallback target; runtime window ids and absolute geometry are outside this wire contract.
     * @param {Object<String,Object>} workspaces Committed documents keyed by `workspaceKey`.
     * @param {Object} [options={}] Envelope fields and optional `placementHints`.
     * @returns {{topology:(Object|null), errors:String[]}}
     * @static
     */
    static captureTopologyPerspective(workspaces, options={}) {
        if (!WorkspaceDocument.isJsonRecord(workspaces) || !Object.keys(workspaces).length) {
            return {topology: null, errors: ['topology capture requires a non-empty record of keyed workspaces']}
        }

        if (!WorkspaceDocument.isJsonRecord(options)) {
            return {topology: null, errors: ['topology options must be a JSON object']}
        }

        let errors       = [],
            normalized   = {},
            fingerprints = {};

        for (const [workspaceKey, document] of Object.entries(workspaces)) {
            if (!workspaceKey.trim() || Persistence.unsafeRecordKeys.has(workspaceKey)) {
                errors.push(`workspace key "${workspaceKey}" is not usable`);
                continue
            }

            const probe = WorkspaceDocument.computeShapeFingerprint(document);

            if (probe.errors.length) {
                errors.push(...probe.errors.map(error => `workspace "${workspaceKey}": ${error}`));
                continue
            }

            const documentErrors = WorkspaceDocument.validate(document),
                  unexpected     = WorkspaceDocument.findUnexpectedDockZoneKey(document, `workspaces.${workspaceKey}`);

            errors.push(...documentErrors.map(error => `workspace "${workspaceKey}": ${error}`));

            if (unexpected) {
                errors.push(`workspace "${workspaceKey}" contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
            }

            if (!documentErrors.length && !unexpected) {
                normalized[workspaceKey] = WorkspaceDocument.normalizeTree(document)
            }
        }

        if (errors.length) {
            return {topology: null, errors}
        }

        for (const [workspaceKey, document] of Object.entries(normalized)) {
            const computed = WorkspaceDocument.computeShapeFingerprint(document);

            if (computed.errors.length) {
                errors.push(...computed.errors.map(error => `persisted workspace "${workspaceKey}": ${error}`))
            } else {
                fingerprints[workspaceKey] = computed.fingerprint
            }
        }

        const composed = WorkspaceDocument.composeTopologyFingerprint(fingerprints);

        errors.push(...composed.errors);

        if (errors.length) {
            return {topology: null, errors}
        }

        const layoutId = Object.hasOwn(options, 'layoutId') ? options.layoutId : 'default',
              title    = Object.hasOwn(options, 'title') ? options.title : layoutId,
              topology = {
                  schema             : Persistence.TOPOLOGY_SCHEMA,
                  layoutId,
                  title,
                  workspaces         : normalized,
                  placementHints     : Object.hasOwn(options, 'placementHints') ? options.placementHints : {},
                  topologyFingerprint: composed.fingerprint,
                  metadata           : Object.hasOwn(options, 'metadata') ? options.metadata : {}
              };

        if (Object.hasOwn(options, 'revision')) {
            topology.revision = options.revision
        }

        if (Object.hasOwn(options, 'perspectiveName')) {
            topology.perspectiveName = options.perspectiveName
        }

        errors.push(...Persistence.validateTopology(topology));

        return errors.length
            ? {topology: null, errors}
            : {topology: WorkspaceDocument.clone(topology), errors: []}
    }

    /**
     * @summary Captures one workspace's dock document as a saved-layout perspective.
     *
     * Single-workspace layout truth only enters the record — the committed
     * document tree — never render projections, runtime handles or pane-internal state (panes
     * are layout-blind, so their internals are not the layout's to save).
     *
     * Fingerprint-coherence by construction: the wrapper is written FIRST (validate + normalize
     * through the one writer path), and the fingerprint is computed from the PERSISTED
     * `layout.dockZone` — never the raw input — so the stored fingerprint cannot describe a
     * tree the record does not contain (normalization collapses e.g. a single-child split to
     * its child; a pre-normalization fingerprint would immortalize the collapsed wrapper).
     * @param {Object} document The committed dock-zone document to capture.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static capturePerspective(document, metadata={}) {
        // pre-probe the RAW input purely as the cycle/shape gate: the writer's normalize pass
        // recurses and must never see a cyclic graph; the probe's fingerprint is DISCARDED so
        // coherence with the persisted tree is never at risk
        const probe = WorkspaceDocument.computeShapeFingerprint(document);

        if (probe.errors.length) {
            return {layout: null, errors: probe.errors}
        }

        const written = Persistence.createSavedLayout(document, {
            ...metadata,
            captureScope     : 'window',
            windowFingerprint: null
        });

        if (written.errors.length) {
            return written
        }

        const {fingerprint, errors} = WorkspaceDocument.computeShapeFingerprint(written.layout.dockZone);

        if (errors.length) {
            return {layout: null, errors}
        }

        written.layout.windowFingerprint = fingerprint;

        return written
    }

    /**
     * @summary Wraps a valid committed dock-zone document in a JSON-only saved-layout envelope.
     *
     * The wrapper and dock-zone tree are finite-schema: unknown fields fail closed. The explicit
     * `metadata` field is an opaque JSON-only non-secret annotation channel; callers must not place
     * credentials or runtime authority inside it.
     * @param {Object} document The committed dock-zone document to normalize and wrap.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, windowFingerprint, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static createSavedLayout(document, metadata={}) {
        if (!WorkspaceDocument.isJsonRecord(metadata)) {
            return {layout: null, errors: ['metadata must be a JSON object']}
        }

        let errors = WorkspaceDocument.validate(document);

        if (Object.hasOwn(metadata, 'captureScope') && metadata.captureScope !== 'window') {
            errors.push('captureScope must be "window" on neo.dock.layout.v1; choose the topology producer instead')
        }

        if (Object.hasOwn(metadata, 'windowDocuments')) {
            errors.push('windowDocuments is retired; choose keyed workspaces in neo.dock.topology.v1 instead')
        }

        if (errors.length) {
            return {layout: null, errors}
        }

        let unexpectedKey = WorkspaceDocument.findUnexpectedDockZoneKey(document, 'document');

        if (unexpectedKey) {
            return {
                layout: null,
                errors: [`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`]
            }
        }

        let normalized = WorkspaceDocument.normalizeTree(document),
            layoutId   = Object.hasOwn(metadata, 'layoutId') ? metadata.layoutId : 'default',
            title      = Object.hasOwn(metadata, 'title') ? metadata.title : layoutId,
            layout     = {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId,
                title,
                dockZone         : normalized,
                metadata         : Object.hasOwn(metadata, 'metadata') ? metadata.metadata : {},
                captureScope     : 'window',
                windowFingerprint: Object.hasOwn(metadata, 'windowFingerprint') ? metadata.windowFingerprint : null
            };

        if (Object.hasOwn(metadata, 'revision')) {
            layout.revision = metadata.revision
        }

        if (Object.hasOwn(metadata, 'perspectiveName')) {
            layout.perspectiveName = metadata.perspectiveName
        }

        if (typeof layout.layoutId !== 'string' || !layout.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        }

        if (typeof layout.title !== 'string' || !layout.title.trim()) {
            errors.push('title must be a non-empty string')
        }

        errors.push(...Persistence.validatePerspectiveFields(layout))

        if (!WorkspaceDocument.isJsonRecord(layout.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = WorkspaceDocument.findSecretMetadataKey(layout.metadata, 'savedLayout.metadata');

        if (secretKey) {
            errors.push(`saved layout metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        unexpectedKey = WorkspaceDocument.findUnexpectedKey(layout, Persistence.savedLayoutKeys, 'savedLayout') ||
            WorkspaceDocument.findUnexpectedDockZoneKey(layout.dockZone, 'savedLayout.dockZone');

        if (unexpectedKey) {
            errors.push(`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = WorkspaceDocument.findNonJsonValue(layout);

        if (nonJson) {
            errors.push(`saved layout ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        return errors.length ? {layout: null, errors} : {layout: WorkspaceDocument.clone(layout), errors: []}
    }

    /**
     * @summary Restores a saved-layout wrapper into a validated dock-zone document.
     *
     * The wrapper and dock-zone tree must match the finite persisted schema. The explicit `metadata`
     * and item `blueprint` fields are opaque JSON-only non-secret payloads; runtime fields beside the
     * known model are rejected rather than filtered or repaired.
     * @param {Object} savedLayout
     * @returns {{document:(Object|null), errors:String[]}}
     * @static
     */
    static restoreSavedLayout(savedLayout) {
        let errors = [];

        if (!WorkspaceDocument.isJsonRecord(savedLayout)) {
            return {document: null, errors: ['saved layout must be a JSON object']}
        }

        if (savedLayout.schema !== Persistence.LAYOUT_SCHEMA) {
            errors.push(`schema must be ${Persistence.LAYOUT_SCHEMA}`)
        }

        errors.push(...Persistence.validatePerspectiveFields(savedLayout));

        if (typeof savedLayout.layoutId !== 'string' || !savedLayout.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        }

        if (typeof savedLayout.title !== 'string' || !savedLayout.title.trim()) {
            errors.push('title must be a non-empty string')
        }

        if (!WorkspaceDocument.isJsonRecord(savedLayout.dockZone)) {
            errors.push('dockZone must be a JSON object')
        }

        if (Object.hasOwn(savedLayout, 'metadata') && !WorkspaceDocument.isJsonRecord(savedLayout.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = Object.hasOwn(savedLayout, 'metadata')
            ? WorkspaceDocument.findSecretMetadataKey(savedLayout.metadata, 'savedLayout.metadata')
            : null;

        if (secretKey) {
            errors.push(`saved layout metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        let unexpectedKey = WorkspaceDocument.findUnexpectedKey(savedLayout, Persistence.savedLayoutKeys, 'savedLayout') ||
            WorkspaceDocument.findUnexpectedDockZoneKey(savedLayout.dockZone, 'savedLayout.dockZone');

        if (unexpectedKey) {
            errors.push(`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = WorkspaceDocument.findNonJsonValue(savedLayout);

        if (nonJson) {
            errors.push(`saved layout ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        if (!errors.length) {
            errors.push(...WorkspaceDocument.validate(savedLayout.dockZone));
        }

        if (errors.length) {
            return {document: null, errors}
        }

        let normalized       = WorkspaceDocument.normalizeTree(savedLayout.dockZone),
            normalizedErrors = WorkspaceDocument.validate(normalized);

        return normalizedErrors.length
            ? {document: null, errors: normalizedErrors}
            : {document: WorkspaceDocument.clone(normalized), errors: []}
    }

    /**
     * @summary Validates one keyed multi-workspace topology and its aggregate evidence.
     *
     * The validation is total and finite-schema. Every workspace document passes the same model
     * boundary as a single layout; item ids stay unique across the topology; placement hints are
     * relative semantic records only; and the stored aggregate fingerprint must equal a fresh
     * key-sorted composition of the persisted workspaces.
     * @param {Object} topology
     * @returns {String[]} Validation errors, empty for a contract-clean topology.
     * @static
     */
    static validateTopology(topology) {
        let errors = [];

        if (!WorkspaceDocument.isJsonRecord(topology)) {
            return ['topology must be a JSON object']
        }

        if (topology.schema !== Persistence.TOPOLOGY_SCHEMA) {
            errors.push(`schema must be ${Persistence.TOPOLOGY_SCHEMA}`)
        }

        if (typeof topology.layoutId !== 'string' || !topology.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        } else if (Persistence.unsafeRecordKeys.has(topology.layoutId)) {
            errors.push(`layoutId "${topology.layoutId}" is not usable`)
        }

        if (typeof topology.title !== 'string' || !topology.title.trim()) {
            errors.push('title must be a non-empty string')
        }

        if (Object.hasOwn(topology, 'captureScope')) {
            errors.push('captureScope is not valid on neo.dock.topology.v1; the schema is the mode')
        }

        if (Object.hasOwn(topology, 'windowDocuments')) {
            errors.push('windowDocuments is retired; topology workspaces must be keyed by workspaceKey')
        }

        if (Object.hasOwn(topology, 'perspectiveName') &&
            (typeof topology.perspectiveName !== 'string' || !topology.perspectiveName.trim())
        ) {
            errors.push('perspectiveName must be a non-empty string when present')
        } else if (Persistence.unsafeRecordKeys.has(topology.perspectiveName)) {
            errors.push(`perspectiveName "${topology.perspectiveName}" is not usable`)
        }

        if (!WorkspaceDocument.isJsonRecord(topology.workspaces) || !Object.keys(topology.workspaces).length) {
            errors.push('workspaces must be a non-empty JSON object keyed by workspaceKey')
        }

        if (!WorkspaceDocument.isJsonRecord(topology.placementHints)) {
            errors.push('placementHints must be a JSON object keyed by workspaceKey')
        }

        if (!WorkspaceDocument.isJsonRecord(topology.topologyFingerprint)) {
            errors.push('topologyFingerprint must be a JSON object')
        } else if (topology.topologyFingerprint.schema !== 'neo.dock.topologyShape.v2') {
            errors.push('topologyFingerprint schema must be neo.dock.topologyShape.v2')
        }

        if (Object.hasOwn(topology, 'metadata') && !WorkspaceDocument.isJsonRecord(topology.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let unexpected = WorkspaceDocument.findUnexpectedKey(topology, Persistence.topologyKeys, 'topology');

        if (unexpected) {
            errors.push(`topology contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
        }

        const metadataSecret = Object.hasOwn(topology, 'metadata')
            ? WorkspaceDocument.findSecretMetadataKey(topology.metadata, 'topology.metadata')
            : null;

        if (metadataSecret) {
            errors.push(`topology metadata contains secret-like field "${metadataSecret.key}" at ${metadataSecret.path}: ${metadataSecret.reason}`)
        }

        const itemOwners   = new Map(),
              fingerprints = {};

        if (WorkspaceDocument.isJsonRecord(topology.workspaces)) {
            for (const [workspaceKey, document] of Object.entries(topology.workspaces)) {
                if (!workspaceKey.trim() || Persistence.unsafeRecordKeys.has(workspaceKey)) {
                    errors.push(`workspace key "${workspaceKey}" is not usable`);
                    continue
                }

                const documentErrors     = WorkspaceDocument.validate(document),
                      documentUnexpected = WorkspaceDocument.findUnexpectedDockZoneKey(
                          document,
                          `topology.workspaces.${workspaceKey}`
                      );

                errors.push(...documentErrors.map(error => `workspace "${workspaceKey}": ${error}`));

                if (documentUnexpected) {
                    errors.push(
                        `workspace "${workspaceKey}" contains unexpected field "${documentUnexpected.key}" ` +
                        `at ${documentUnexpected.path}: ${documentUnexpected.reason}`
                    )
                }

                Object.keys(document?.items || {}).forEach(itemId => {
                    if (itemOwners.has(itemId)) {
                        errors.push(
                            `workspaces "${itemOwners.get(itemId)}" and "${workspaceKey}" both carry item "${itemId}"`
                        )
                    } else {
                        itemOwners.set(itemId, workspaceKey)
                    }
                });

                const computed = WorkspaceDocument.computeShapeFingerprint(
                    WorkspaceDocument.normalizeTree(document)
                );

                if (computed.errors.length) {
                    errors.push(...computed.errors.map(error => `workspace "${workspaceKey}" fingerprint: ${error}`))
                } else {
                    fingerprints[workspaceKey] = computed.fingerprint
                }
            }
        }

        if (WorkspaceDocument.isJsonRecord(topology.placementHints)) {
            for (const [workspaceKey, hint] of Object.entries(topology.placementHints)) {
                if (!workspaceKey.trim() || Persistence.unsafeRecordKeys.has(workspaceKey)) {
                    errors.push(`placement hint key "${workspaceKey}" is not usable`);
                    continue
                }

                if (!Object.hasOwn(topology.workspaces || {}, workspaceKey)) {
                    errors.push(`placement hint workspace "${workspaceKey}" does not exist in workspaces`)
                }

                if (!WorkspaceDocument.isJsonRecord(hint)) {
                    errors.push(`placement hint "${workspaceKey}" must be a JSON object`);
                    continue
                }

                unexpected = WorkspaceDocument.findUnexpectedKey(
                    hint,
                    Persistence.placementHintKeys,
                    `topology.placementHints.${workspaceKey}`
                );

                if (unexpected) {
                    errors.push(`placement hint "${workspaceKey}" contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
                }

                if (!Number.isFinite(hint.dx) || !Number.isFinite(hint.dy)) {
                    errors.push(`placement hint "${workspaceKey}" requires finite relative dx and dy values`)
                }

                const target = hint.fallbackTarget;

                if (!WorkspaceDocument.isJsonRecord(target)) {
                    errors.push(`placement hint "${workspaceKey}" requires a semantic fallbackTarget`)
                } else {
                    unexpected = WorkspaceDocument.findUnexpectedKey(
                        target,
                        Persistence.fallbackTargetKeys,
                        `topology.placementHints.${workspaceKey}.fallbackTarget`
                    );

                    if (unexpected) {
                        errors.push(`fallbackTarget for "${workspaceKey}" contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
                    }

                    if (typeof target.workspaceKey !== 'string' || !target.workspaceKey.trim()) {
                        errors.push(`fallbackTarget for "${workspaceKey}" requires a non-empty workspaceKey`)
                    } else if (!Object.hasOwn(topology.workspaces || {}, target.workspaceKey)) {
                        errors.push(`fallbackTarget workspace "${target.workspaceKey}" does not exist`)
                    }

                    if (typeof target.nodeId !== 'string' || !target.nodeId.trim()) {
                        errors.push(`fallbackTarget for "${workspaceKey}" requires a non-empty nodeId`)
                    } else if (topology.workspaces?.[target.workspaceKey] &&
                        !Object.hasOwn(topology.workspaces[target.workspaceKey].nodes || {}, target.nodeId)
                    ) {
                        errors.push(`fallbackTarget node "${target.nodeId}" does not exist in workspace "${target.workspaceKey}"`)
                    }
                }
            }
        }

        const composed = WorkspaceDocument.composeTopologyFingerprint(fingerprints);

        if (!composed.errors.length && WorkspaceDocument.isJsonRecord(topology.topologyFingerprint) &&
            !Neo.isEqual(topology.topologyFingerprint, composed.fingerprint)
        ) {
            errors.push('topologyFingerprint does not match the keyed workspace documents')
        }

        const nonJson = WorkspaceDocument.findNonJsonValue(topology, 'topology');

        if (nonJson) {
            errors.push(`topology ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        return errors
    }

    /**
     * @summary Restores one topology as a normalized, isolated JSON record.
     * @param {Object} topology
     * @returns {{topology:(Object|null), errors:String[]}}
     * @static
     */
    static restoreTopology(topology) {
        let errors = Persistence.validateTopology(topology);

        if (errors.length) {
            return {topology: null, errors}
        }

        const restored = WorkspaceDocument.clone(topology);

        Object.entries(restored.workspaces).forEach(([workspaceKey, document]) => {
            restored.workspaces[workspaceKey] = WorkspaceDocument.normalizeTree(document)
        });

        return {topology: restored, errors: []}
    }

    /**
     * @summary Validates a named collection of topology records without widening the layout library.
     * @param {Object} collection
     * @returns {String[]}
     * @static
     */
    static validateTopologyCollection(collection) {
        let errors = [];

        if (!WorkspaceDocument.isJsonRecord(collection)) {
            return ['topology collection must be a JSON object']
        }

        if (collection.schema !== Persistence.TOPOLOGY_COLLECTION_SCHEMA) {
            errors.push(`schema must be ${Persistence.TOPOLOGY_COLLECTION_SCHEMA}`)
        }

        if (!Object.hasOwn(collection, 'activeLayoutId')) {
            errors.push('activeLayoutId is required')
        } else if (collection.activeLayoutId !== null &&
            (typeof collection.activeLayoutId !== 'string' || !collection.activeLayoutId.trim())
        ) {
            errors.push('activeLayoutId must be a non-empty string or null')
        }

        if (!WorkspaceDocument.isJsonRecord(collection.topologies)) {
            errors.push('topologies must be a JSON object keyed by layoutId')
        }

        if (Object.hasOwn(collection, 'metadata') && !WorkspaceDocument.isJsonRecord(collection.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let unexpected = WorkspaceDocument.findUnexpectedKey(
            collection,
            Persistence.topologyCollectionKeys,
            'topologyCollection'
        );

        if (unexpected) {
            errors.push(`topology collection contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
        }

        const secret = Object.hasOwn(collection, 'metadata')
            ? WorkspaceDocument.findSecretMetadataKey(collection.metadata, 'topologyCollection.metadata')
            : null;

        if (secret) {
            errors.push(`topology collection metadata contains secret-like field "${secret.key}" at ${secret.path}: ${secret.reason}`)
        }

        const namespaceOwners = new Map();

        if (WorkspaceDocument.isJsonRecord(collection.topologies)) {
            for (const [layoutId, topology] of Object.entries(collection.topologies)) {
                if (!layoutId.trim() || Persistence.unsafeRecordKeys.has(layoutId)) {
                    errors.push(`topology key "${layoutId}" is not usable`);
                    continue
                }

                if (topology?.layoutId !== layoutId) {
                    errors.push(`topology key "${layoutId}" must match topology layoutId "${topology?.layoutId}"`)
                }

                for (const name of [layoutId, topology?.perspectiveName].filter(Boolean)) {
                    if (Persistence.unsafeRecordKeys.has(name)) {
                        errors.push(`topology name "${name}" is not usable`)
                    } else if (namespaceOwners.has(name) && namespaceOwners.get(name) !== layoutId) {
                        errors.push(`topology name "${name}" is shared by "${namespaceOwners.get(name)}" and "${layoutId}"`)
                    } else {
                        namespaceOwners.set(name, layoutId)
                    }
                }

                errors.push(...Persistence.validateTopology(topology).map(error => `topology "${layoutId}": ${error}`))
            }
        }

        const count = WorkspaceDocument.isJsonRecord(collection.topologies)
            ? Object.keys(collection.topologies).length
            : 0;

        if (collection.activeLayoutId === null && count > 0) {
            errors.push('activeLayoutId must name an existing topology when topologies are present')
        } else if (typeof collection.activeLayoutId === 'string' &&
            WorkspaceDocument.isJsonRecord(collection.topologies) &&
            !Object.hasOwn(collection.topologies, collection.activeLayoutId)
        ) {
            errors.push(`activeLayoutId "${collection.activeLayoutId}" does not exist`)
        }

        const nonJson = WorkspaceDocument.findNonJsonValue(collection, 'topologyCollection');

        if (nonJson) {
            errors.push(`topology collection ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        return errors
    }

    /**
     * @summary Creates a named topology collection from an array or layoutId-keyed record.
     * @param {Object[]|Object<String,Object>} [topologies=[]]
     * @param {Object} [options={}]
     * @returns {{collection:(Object|null), errors:String[]}}
     * @static
     */
    static createTopologyCollection(topologies=[], options={}) {
        if (!Array.isArray(topologies) && !WorkspaceDocument.isJsonRecord(topologies)) {
            return {collection: null, errors: ['topologies must be an array or JSON object']}
        }

        if (!WorkspaceDocument.isJsonRecord(options)) {
            return {collection: null, errors: ['options must be a JSON object']}
        }

        const collection = {
                schema        : Persistence.TOPOLOGY_COLLECTION_SCHEMA,
                activeLayoutId: Object.hasOwn(options, 'activeLayoutId') ? options.activeLayoutId : null,
                topologies    : {},
                metadata      : Object.hasOwn(options, 'metadata') ? options.metadata : {}
            },
            entries = Array.isArray(topologies)
                ? topologies.map((topology, index) => [topology?.layoutId ?? `index-${index}`, topology])
                : Object.entries(topologies),
            errors = [];

        for (const [layoutId, topology] of entries) {
            if (typeof layoutId !== 'string' || !layoutId.trim() || Persistence.unsafeRecordKeys.has(layoutId)) {
                errors.push(`topology key "${layoutId}" is not usable`);
                continue
            }

            collection.topologies[layoutId] = WorkspaceDocument.clone(topology)
        }

        if (!Object.hasOwn(options, 'activeLayoutId')) {
            collection.activeLayoutId = Object.keys(collection.topologies)[0] ?? null
        }

        if (Object.hasOwn(options, 'revision')) {
            collection.revision = options.revision
        }

        errors.push(...Persistence.validateTopologyCollection(collection));

        return errors.length
            ? {collection: null, errors}
            : {collection: WorkspaceDocument.clone(collection), errors: []}
    }

    /**
     * @summary Restores the active topology selected by a topology collection.
     * @param {Object} collection
     * @returns {{topology:(Object|null), errors:String[]}}
     * @static
     */
    static restoreActiveTopology(collection) {
        const errors = Persistence.validateTopologyCollection(collection);

        if (errors.length) {
            return {topology: null, errors}
        }

        if (collection.activeLayoutId === null) {
            return {topology: null, errors: ['topology collection has no activeLayoutId']}
        }

        return Persistence.restoreTopology(collection.topologies[collection.activeLayoutId])
    }
}

export default Neo.setupClass(Persistence);
