/**
 * @summary Reads the live GL state of a launched browser, as three states rather than two.
 *
 * This module exists because of a configuration whose *text* never rotted — `--use-gl=desktop` stayed
 * spelled correctly while Chrome's ANGLE-only allowlist quietly stopped accepting it, so GL resolved
 * to `none` from the day the flag landed. No source-shaped instrument can see that: the config reads
 * fine, the lint passes, the suite is green. Only the *effect* differs, so only an effect probe finds it.
 *
 * **Three states, not two — this is the point of the module.** A probe that answers
 * healthy-or-degraded is itself a Face-C artifact: when `WEBGL_debug_renderer_info` is unavailable
 * it would report the absence of evidence as evidence of health, which is the same shape as the bug
 * it guards. `unobserved` exists so "could not look" can never be spoken as "looked and it was fine".
 *
 * @see test/playwright/e2e/gl.setup.mjs  the boot gate that acts on this reading
 * @see https://github.com/neomjs/neo/issues/15664  the incident
 * @see https://github.com/orgs/neomjs/discussions/15812  the artifact-that-cannot-fail class
 */

/**
 * @summary Substrings that identify a software rasterizer in an unmasked renderer string.
 *
 * **Deliberately a deny-list, and deliberately incomplete.** An allow-list of hardware renderers
 * would need every GPU on every platform and would fail closed on the next one shipped — a guard
 * that breaks on new hardware gets switched off. This list is the *secondary* signal; the primary
 * one is structural and needs no string matching at all: under `--use-gl=desktop` paired with
 * `--disable-software-rasterizer` a WebGL context cannot be created at all, so `context: false` is
 * the unambiguous tell. Treat additions here as refinements, never as the mechanism.
 * @type {String[]}
 */
export const SOFTWARE_RENDERER_MARKERS = ['swiftshader', 'llvmpipe', 'software', 'microsoft basic render'];

/**
 * @summary Observes the browser's actual GL capability from inside the launched page.
 *
 * Runs in page context: creates a throwaway canvas, requests a WebGL context, and asks
 * `WEBGL_debug_renderer_info` for the unmasked renderer. The generic `gl.getParameter(gl.RENDERER)`
 * is captured too but is not decisive — Chrome answers `'WebKit WebGL'` regardless of what is
 * underneath, verified on a healthy macOS seat, so it cannot separate hardware from software.
 *
 * @param {Object}   page                A Playwright page on any loaded document.
 * @returns {Promise<{state: String, renderer: String|null, vendor: String|null, generic: String|null, reason: String|null}>}
 *          `state` is one of:
 *          - `'accelerated'` — a context exists and its unmasked renderer names no software rasterizer.
 *          - `'degraded'`    — no WebGL context at all, or the renderer names a software rasterizer.
 *          - `'unobserved'`  — a context exists but the renderer could not be identified, or the
 *                              evaluation itself failed. **Never** collapse this into `'accelerated'`.
 */
export async function readGlState(page) {
    let raw;

    try {
        raw = await page.evaluate(() => {
            const
                canvas = document.createElement('canvas'),
                gl     = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

            if (!gl) return {context: false};

            const ext = gl.getExtension('WEBGL_debug_renderer_info');

            return {
                context : true,
                renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
                vendor  : ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : null,
                generic : gl.getParameter(gl.RENDERER)
            }
        })
    } catch (error) {
        // The probe failing is not the browser being healthy. Say so.
        return {state: 'unobserved', renderer: null, vendor: null, generic: null, reason: `probe-evaluation-failed: ${error?.message ?? 'unknown'}`}
    }

    if (!raw.context) {
        return {state: 'degraded', renderer: null, vendor: null, generic: null, reason: 'no-webgl-context'}
    }

    if (!raw.renderer) {
        return {state: 'unobserved', renderer: null, vendor: raw.vendor, generic: raw.generic, reason: 'webgl-debug-renderer-info-unavailable'}
    }

    const software = SOFTWARE_RENDERER_MARKERS.find(marker => raw.renderer.toLowerCase().includes(marker));

    return software
        ? {state: 'degraded', renderer: raw.renderer, vendor: raw.vendor, generic: raw.generic, reason: `software-renderer: ${software}`}
        : {state: 'accelerated', renderer: raw.renderer, vendor: raw.vendor, generic: raw.generic, reason: null}
}
