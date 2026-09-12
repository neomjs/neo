/**
 * @summary Reads one Workstation window's boot intent from the URL the main thread registered for it.
 *
 * Both sides of window adoption read this — the arriving window's controller, to decide whether it refuses
 * or creates a root, and the owning root's controller, to decide whether an arrival is its to adopt — so the
 * intent is resolved in one place, by one rule: the MODE is the presence of a parameter, the KEY is its
 * value. `?workspace=` with an empty value is therefore a saved-window intent with no key — refused by the
 * arriving side, ignored by the owner — and never a default boot to one side and a refusal to the other.
 *
 * A leaf by design: it imports nothing, so the controllers can import it without loading the application
 * entry point, whose composition loads the controllers again.
 *
 * @param {String} windowId
 * @returns {{mode: 'default'|'popout'|'workspace', key: String|null, params: URLSearchParams}}
 */
export function resolveBootIntent(windowId) {
    const config = Neo.windowConfigs?.[windowId] || Neo.config,
          params = new URLSearchParams(config.url?.search ?? ''),
          mode   = params.has('popout') ? 'popout' : params.has('workspace') ? 'workspace' : 'default';

    return {mode, key: mode === 'default' ? null : params.get(mode), params}
}
