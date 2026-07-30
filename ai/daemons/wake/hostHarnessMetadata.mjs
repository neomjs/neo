/**
 * @module ai/daemons/wake/hostHarnessMetadata
 * @summary Graphless host-app shortcut defaults shared by wake delivery and lifecycle routing.
 */
const APP_HARNESS_DEFAULTS = Object.freeze({
    Antigravity: Object.freeze({
        tabShortcut: 'shift+i'
    }),
    Claude: Object.freeze({
        tabShortcut      : '3',
        focusSeedSequence: 'r-undo'
    })
});

/**
 * @summary Applies host-app defaults while preserving explicit metadata, including null opt-outs.
 * @param {Object} metadata
 * @returns {Object}
 */
export function applyHarnessMetadataDefaults(metadata = {}) {
    const result   = {...metadata};
    const defaults = APP_HARNESS_DEFAULTS[result.appName] || {};

    if (result.tabShortcut === undefined && Object.hasOwn(defaults, 'tabShortcut')) {
        result.tabShortcut = defaults.tabShortcut;
    }

    if (
        result.focusSeedSequence === undefined &&
        result.focusSeedKey === undefined &&
        Object.hasOwn(defaults, 'focusSeedSequence')
    ) {
        result.focusSeedSequence = defaults.focusSeedSequence;
    }

    return result;
}
