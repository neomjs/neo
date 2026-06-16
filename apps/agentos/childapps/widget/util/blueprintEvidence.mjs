/**
 * @module AgentOSWidget.util.blueprintEvidence
 * @summary Safe projection of a first-widget blueprint into inspectable evidence metadata.
 *
 * The H2 transcript/evidence pane must show *what* blueprint produced the live widget — but it must
 * never render the raw blueprint as trusted HTML or executable code. This projection is that safe
 * boundary: it accepts the blueprint object the first-widget pane consumed and returns ONLY
 * non-executable scalar metadata (the schema / class id, a title, and the column + row counts).
 * Anything malformed — non-object input, unexpected keys, or missing required metadata — fails
 * closed to a bounded `{accepted: false, reason}` state the pane renders as plain rejected text,
 * rather than throwing or letting unvalidated data reach the view.
 *
 * Contract (decide-and-document): the first-widget foundation is a bare child-app Viewport that did
 * not pin a blueprint-output shape, so this evidence leaf defines the deterministic shape as
 * `{schema:String, title:String, columns:Array, rows:Array}` — mirroring a grid blueprint's column
 * definitions + data rows. A later live-integration leaf can feed the real create-instance output
 * through this same projection unchanged.
 */

/**
 * The only top-level keys a blueprint-evidence object may carry. Any other key fails the projection
 * closed — an allowlist, not a denylist, so an unexpected/executable field can never slip through.
 * @type {String[]}
 */
const ALLOWED_KEYS = ['schema', 'title', 'columns', 'rows'];

/**
 * Projects an accepted first-widget blueprint into safe, render-ready evidence metadata.
 *
 * @param {Object} blueprint the accepted first-widget blueprint evidence
 * @returns {{accepted: Boolean, schema: String, title: String, columnCount: Number, rowCount: Number}|{accepted: Boolean, reason: String}}
 *   `{accepted: true, schema, title, columnCount, rowCount}` on success, or
 *   `{accepted: false, reason}` when the input is missing, malformed, or carries unexpected keys.
 */
export function projectBlueprintEvidence(blueprint) {
    if (!Neo.isObject(blueprint)) {
        return {accepted: false, reason: 'Blueprint evidence is missing or not an object.'}
    }

    const unknownKeys = Object.keys(blueprint).filter(key => !ALLOWED_KEYS.includes(key));

    if (unknownKeys.length > 0) {
        return {accepted: false, reason: `Blueprint evidence has unexpected keys: ${unknownKeys.join(', ')}.`}
    }

    const {schema, title, columns, rows} = blueprint;

    if (typeof schema !== 'string' || typeof title !== 'string' || !Array.isArray(columns) || !Array.isArray(rows)) {
        return {accepted: false, reason: 'Blueprint evidence requires a string schema + title and array columns + rows.'}
    }

    return {accepted: true, schema, title, columnCount: columns.length, rowCount: rows.length}
}
