import Base     from '../../../core/Base.mjs';
import Document from './Document.mjs';

/**
 * @class Neo.dashboard.dock.model.Persistence
 * @extends Neo.core.Base
 *
 * @summary Saved-layout envelope authority: perspective capture, wrapper validation, and restore for single layouts.
 *
 * Split out of the former monolithic zone model per the graduated v13.2 DockLayouts
 * architecture: `model.Document` owns the committed-document contract, `model.Operations`
 * owns the semantic reducer vocabulary, `model.Persistence` owns saved-layout envelopes,
 * and `persistence.PerspectiveLibrary` is the sole collection/perspective authority.
 * Return shape for every operation and envelope helper: `{document|layout, errors}` —
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
     * The saved layout wrapper schema around a normalized dock-zone document, carrying the
     * perspective fields (`captureScope`, `windowFingerprint`, `perspectiveName`). One greenfield
     * revision: readers fail closed on every other schema string — no legacy family, no
     * migration reader, no alias survives the v13.2 hard cut.
     * @member {String} LAYOUT_SCHEMA='neo.dock.layout.v1'
     * @static
     */
    static LAYOUT_SCHEMA = 'neo.dock.layout.v1'

    /**
     * The capture scopes a saved layout may declare: one window's dock document, or the whole
     * multi-window topology.
     * @member {String[]} CAPTURE_SCOPES
     * @static
     */
    static CAPTURE_SCOPES = ['window', 'topology']

    /**
     * Top-level fields allowed in a saved-layout wrapper.
     * @member {Set<String>} savedLayoutKeys
     * @protected
     * @static
     */
    static savedLayoutKeys = new Set([
        'schema', 'layoutId', 'title', 'dockZone', 'metadata', 'revision',
        'captureScope', 'windowFingerprint', 'perspectiveName', 'windowDocuments'
    ])

    /**
     * @summary Validates the perspective fields shared by the create and restore paths.
     *
     * `captureScope` must be one of {@link #CAPTURE_SCOPES}; `windowFingerprint` describes
     * topology SHAPE only and must be a JSON object or null (never window ids or coordinates —
     * the persistence guardrail); `perspectiveName`, when present, must be a non-empty string.
     * @param {Object} layout The saved-layout record carrying the perspective fields.
     * @returns {String[]} Validation errors, empty when the fields are contract-clean.
     * @static
     */
    static validatePerspectiveFields(layout) {
        let errors = [];

        if (!Persistence.CAPTURE_SCOPES.includes(layout.captureScope)) {
            errors.push(`captureScope must be one of: ${Persistence.CAPTURE_SCOPES.join(', ')}`)
        }

        if (layout.windowFingerprint !== null && !Document.isJsonRecord(layout.windowFingerprint)) {
            errors.push('windowFingerprint must be a JSON object or null')
        }

        if (Object.hasOwn(layout, 'perspectiveName') &&
            (typeof layout.perspectiveName !== 'string' || !layout.perspectiveName.trim())
        ) {
            errors.push('perspectiveName must be a non-empty string when present')
        }

        // windowDocuments carries the ADDITIONAL windows' trees (slots 1..N; slot 0 stays
        // `dockZone`, so the degenerate single-window topology record equals a window-scope
        // capture by construction). Topology-scope-only: a window-scope record carrying it
        // fails closed; every slot tree passes the full dock-zone validation, offender indexed.
        if (Object.hasOwn(layout, 'windowDocuments')) {
            if (layout.captureScope !== 'topology') {
                errors.push('windowDocuments is only valid on captureScope "topology" records')
            } else if (!Array.isArray(layout.windowDocuments)) {
                errors.push('windowDocuments must be an array of dock-zone documents')
            } else {
                layout.windowDocuments.forEach((tree, index) => {
                    const treeErrors = Document.validate(tree);

                    if (treeErrors.length) {
                        errors.push(`windowDocuments[${index}] is not a valid dock-zone document: ${treeErrors[0]}`)
                    }

                    // The finite durable-field boundary applies to EVERY captured slot, not only
                    // the primary `dockZone` — runtime-bearing fields (window fingerprints,
                    // rects) must not ride an additional window document into persistence.
                    const unexpected = Document.findUnexpectedDockZoneKey(tree, `windowDocuments[${index}]`);

                    if (unexpected) {
                        errors.push(`windowDocuments[${index}] contains unexpected field "${unexpected.key}" at ${unexpected.path}: ${unexpected.reason}`)
                    }
                })
            }
        }

        return errors
    }

    /**
     * @summary Captures a whole multi-window topology as ONE v2 saved-layout perspective.
     *
     * Slot order is meaning: `documents[0]` becomes the primary `dockZone`, the remaining
     * slots persist as `windowDocuments` (topology-scope-only), and `windowFingerprint` holds
     * the composed topology term — so a single-document topology capture is structurally
     * identical to a window-scope capture apart from its declared scope and composed
     * fingerprint schema (the degenerate-case identity, asserted in the unit specs).
     *
     * Fingerprint-coherence by construction (same rule as {@link #capturePerspective}): raw
     * inputs are fingerprint-PROBED first purely as the cycle/shape gate (results discarded —
     * the writer's normalize pass must never see a cyclic graph), then the composed fingerprint
     * derives exclusively from the PERSISTED trees, so it can never describe shapes the record
     * does not contain.
     * @param {Object[]} documents Ordered committed dock-zone documents, primary first.
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static captureTopologyPerspective(documents, metadata={}) {
        if (!Array.isArray(documents) || documents.length < 1) {
            return {layout: null, errors: ['topology capture requires a non-empty ordered array of documents']}
        }

        // probe every raw input first — the cycle/shape gate before any recursion-bearing pass
        for (let i = 0; i < documents.length; i++) {
            const probe = Document.computeShapeFingerprint(documents[i]);

            if (probe.errors.length) {
                return {layout: null, errors: probe.errors.map(error => `documents[${i}]: ${error}`)}
            }
        }

        const written = Persistence.createSavedLayout(documents[0], {
            ...metadata,
            captureScope     : 'topology',
            windowFingerprint: null,
            ...(documents.length > 1 && {
                windowDocuments: documents.slice(1).map(Document.normalizeTree)
            })
        });

        if (written.errors.length) {
            return written
        }

        // compose from the PERSISTED trees — the primary + the stored slots — never the raw inputs
        const persisted    = [written.layout.dockZone, ...(written.layout.windowDocuments || [])],
              fingerprints = [];

        for (let i = 0; i < persisted.length; i++) {
            const {fingerprint, errors} = Document.computeShapeFingerprint(persisted[i]);

            if (errors.length) {
                return {layout: null, errors: errors.map(error => `persisted[${i}]: ${error}`)}
            }

            fingerprints.push(fingerprint)
        }

        const composed = Document.composeTopologyFingerprint(fingerprints);

        if (composed.errors.length) {
            return {layout: null, errors: composed.errors}
        }

        written.layout.windowFingerprint = composed.fingerprint;

        return written
    }

    /**
     * @summary Captures the current window's dock document as a v2 saved-layout perspective.
     *
     * The single-window capture scope: layout truth only enters the record — the committed
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
        const probe = Document.computeShapeFingerprint(document);

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

        const {fingerprint, errors} = Document.computeShapeFingerprint(written.layout.dockZone);

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
     * @param {Object} [metadata={}] {layoutId, title, revision, metadata, captureScope, windowFingerprint, perspectiveName}
     * @returns {{layout:(Object|null), errors:String[]}}
     * @static
     */
    static createSavedLayout(document, metadata={}) {
        if (!Document.isJsonRecord(metadata)) {
            return {layout: null, errors: ['metadata must be a JSON object']}
        }

        let errors = Document.validate(document);

        if (errors.length) {
            return {layout: null, errors}
        }

        let unexpectedKey = Document.findUnexpectedDockZoneKey(document, 'document');

        if (unexpectedKey) {
            return {
                layout: null,
                errors: [`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`]
            }
        }

        let normalized = Document.normalizeTree(document),
            layoutId   = Object.hasOwn(metadata, 'layoutId') ? metadata.layoutId : 'default',
            title      = Object.hasOwn(metadata, 'title') ? metadata.title : layoutId,
            layout     = {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId,
                title,
                dockZone         : normalized,
                metadata         : Object.hasOwn(metadata, 'metadata') ? metadata.metadata : {},
                captureScope     : Object.hasOwn(metadata, 'captureScope') ? metadata.captureScope : 'window',
                windowFingerprint: Object.hasOwn(metadata, 'windowFingerprint') ? metadata.windowFingerprint : null
            };

        if (Object.hasOwn(metadata, 'revision')) {
            layout.revision = metadata.revision
        }

        if (Object.hasOwn(metadata, 'perspectiveName')) {
            layout.perspectiveName = metadata.perspectiveName
        }

        if (Object.hasOwn(metadata, 'windowDocuments')) {
            layout.windowDocuments = metadata.windowDocuments
        }

        if (typeof layout.layoutId !== 'string' || !layout.layoutId.trim()) {
            errors.push('layoutId must be a non-empty string')
        }

        if (typeof layout.title !== 'string' || !layout.title.trim()) {
            errors.push('title must be a non-empty string')
        }

        errors.push(...Persistence.validatePerspectiveFields(layout))

        if (!Document.isJsonRecord(layout.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = Document.findSecretMetadataKey(layout.metadata, 'savedLayout.metadata');

        if (secretKey) {
            errors.push(`saved layout metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        unexpectedKey = Document.findUnexpectedKey(layout, Persistence.savedLayoutKeys, 'savedLayout') ||
            Document.findUnexpectedDockZoneKey(layout.dockZone, 'savedLayout.dockZone');

        if (unexpectedKey) {
            errors.push(`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = Document.findNonJsonValue(layout);

        if (nonJson) {
            errors.push(`saved layout ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        return errors.length ? {layout: null, errors} : {layout: Document.clone(layout), errors: []}
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

        if (!Document.isJsonRecord(savedLayout)) {
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

        if (!Document.isJsonRecord(savedLayout.dockZone)) {
            errors.push('dockZone must be a JSON object')
        }

        if (Object.hasOwn(savedLayout, 'metadata') && !Document.isJsonRecord(savedLayout.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = Object.hasOwn(savedLayout, 'metadata')
            ? Document.findSecretMetadataKey(savedLayout.metadata, 'savedLayout.metadata')
            : null;

        if (secretKey) {
            errors.push(`saved layout metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        let unexpectedKey = Document.findUnexpectedKey(savedLayout, Persistence.savedLayoutKeys, 'savedLayout') ||
            Document.findUnexpectedDockZoneKey(savedLayout.dockZone, 'savedLayout.dockZone');

        if (unexpectedKey) {
            errors.push(`saved layout contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = Document.findNonJsonValue(savedLayout);

        if (nonJson) {
            errors.push(`saved layout ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        if (!errors.length) {
            errors.push(...Document.validate(savedLayout.dockZone));
        }

        if (errors.length) {
            return {document: null, errors}
        }

        let normalized       = Document.normalizeTree(savedLayout.dockZone),
            normalizedErrors = Document.validate(normalized);

        return normalizedErrors.length
            ? {document: null, errors: normalizedErrors}
            : {document: Document.clone(normalized), errors: []}
    }
}

export default Neo.setupClass(Persistence);
