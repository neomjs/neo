import Base from './Base.mjs';

/**
 * @summary FLIP-animates dock re-layouts: committed dock operations glide instead of snapping.
 *
 * Two-phase contract, driven by the owning workspace around its re-projection:
 * 1. `captureFirst()` — snapshot the bounding rects of every marker element inside the host
 *    BEFORE the workspace swaps its projected tree.
 * 2. `play()` — after the swap, wait (bounded, frame-polled) for the marker elements of the
 *    NEW tree to exist and paint, re-measure, apply the inverted transform, then release it
 *    so the browser transitions each element from its old geometry to its new one.
 *
 * Correlation is marker-class based (`{markerPrefix}<stableKey>`), because projected pane
 * component instances may be recreated across a coarse refresh while their dock ITEM identity
 * is stable — classes travel with the item's config, so First/Last rects correlate even when
 * the DOM nodes are new. Entering elements (no First rect) fade/scale in from their landing
 * spot; exiting elements are the outgoing tree's problem and need no animation.
 *
 * Presentation-only by contract: the committed document never waits on motion — a failed or
 * skipped animation lands the final layout instantly (every path here is fail-safe), and
 * `prefers-reduced-motion: reduce` renders the instant path by construction.
 * @class Neo.main.addon.DockFlip
 * @extends Neo.main.addon.Base
 */
class DockFlip extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.DockFlip'
         * @protected
         */
        className: 'Neo.main.addon.DockFlip',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'captureFirst',
                'play'
            ]
        }
    }

    /**
     * First-phase rect snapshots, keyed by hostId → Map<markerClass, DOMRect>.
     * @member {Object} #firstRects={}
     * @private
     */
    #firstRects = {}

    /**
     * Collects the marker elements inside a host: every element whose class list contains a
     * class starting with `markerPrefix`. The full marker class is the correlation key.
     * @param {String} hostId
     * @param {String} markerPrefix
     * @returns {Map<String, HTMLElement>}
     */
    collectMarkers(hostId, markerPrefix) {
        const
            host    = document.getElementById(hostId),
            markers = new Map();

        host?.querySelectorAll(`[class*="${markerPrefix}"]`).forEach(el => {
            const key = [...el.classList].find(cls => cls.startsWith(markerPrefix));

            key && !markers.has(key) && markers.set(key, el)
        });

        return markers
    }

    /**
     * Phase 1: snapshot the current geometry of every marker element inside the host.
     * Call immediately BEFORE swapping the projected tree.
     * @param {Object} opts
     * @param {String} opts.hostId       The dock host element id
     * @param {String} opts.markerPrefix The marker-class prefix carrying the stable item key
     */
    captureFirst({hostId, markerPrefix}) {
        const
            els   = [],
            rects = new Map();

        this.collectMarkers(hostId, markerPrefix).forEach((el, key) => {
            rects.set(key, el.getBoundingClientRect());
            els.push(el)
        });

        this.#firstRects[hostId] = {els, rects}
    }

    /**
     * Phase 2: wait for the new tree's marker elements, invert them onto their old geometry,
     * then play the transition to their new geometry. Safe to call unconditionally after a
     * swap — with no prior `captureFirst()` snapshot, or under reduced motion, it no-ops and
     * the layout simply lands.
     * Duration and easing resolve from the motion-contract tokens (`--dock-transition-duration`
     * / `--dock-transition-easing`) on the host's computed style — zero local duration policy;
     * explicit opts override for special takes, and the hardcoded values are last-resort
     * fallbacks for hosts outside any token scope. A token collapsed to `0ms` (the token-layer
     * reduced-motion path) lands instantly, same as the media-query guard.
     * @param {Object} opts
     * @param {String} opts.hostId            The dock host element id
     * @param {String} opts.markerPrefix      The marker-class prefix used in `captureFirst()`
     * @param {Number} [opts.duration]        Explicit override; default = the token, then 280ms
     * @param {String} [opts.easing]          Explicit override; default = the token, then standard-decelerate
     * @param {Number} [opts.maxFrames=15]    Bounded frame-poll for the new tree to appear
     * @returns {Promise<Boolean>} true if an animation played (resolves AFTER the motion completes), false on any instant-landing path
     */
    async play({hostId, markerPrefix, duration = null, easing = null, maxFrames = 15}) {
        const first = this.#firstRects[hostId];

        let hostEl,
            moves = [];

        // One idempotent settlement path owns every temporary visual mutation. In particular,
        // a rejected post-invert frame must restore the final layout instead of preserving the
        // inverse transform or observability class indefinitely.
        const cleanup = () => {
            moves.forEach(({el}) => {
                el.style.opacity         = '';
                el.style.transform       = '';
                el.style.transformOrigin = '';
                el.style.transition      = ''
            });

            hostEl?.classList.remove('dock-animating');

            hostEl = null;
            moves  = []
        };

        delete this.#firstRects[hostId];

        if (!first?.rects.size || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return false
        }

        hostEl = document.getElementById(hostId);

        // environment-honest global access: the unit env's mocked DOM has no getComputedStyle,
        // so token resolution degrades to the fallbacks there — exactly the intended contract
        const tokens = hostEl && globalThis.getComputedStyle?.(hostEl);

        duration ??= parseFloat(tokens?.getPropertyValue('--dock-transition-duration')) || 280;
        easing   ||= tokens?.getPropertyValue('--dock-transition-easing').trim() || 'cubic-bezier(0, 0, 0.2, 1)';

        if (!(duration > 0)) {
            return false // token-layer reduced-motion collapse: land instantly
        }

        const firstRects = first.rects;

        try {
            let frame = 0;

            // stage A: the swap lands asynchronously through the delta pipeline — the OLD
            // tree's markers would satisfy a naive presence-poll instantly and measure
            // identical geometry, so first wait (bounded) for an outgoing element to detach
            while (frame < maxFrames && first.els.length > 0 && first.els.every(el => el.isConnected)) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                frame++
            }

            // stage B: now wait (bounded) for the NEW tree's markers to exist
            let markers = this.collectMarkers(hostId, markerPrefix);

            while (markers.size < 1 && frame < maxFrames * 2) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                frame++;
                markers = this.collectMarkers(hostId, markerPrefix)
            }

            if (markers.size < 1) {
                return false
            }

            await new Promise(resolve => requestAnimationFrame(resolve));

            markers.forEach((el, key) => {
                const
                    first = firstRects.get(key),
                    last  = el.getBoundingClientRect();

                if (!first) {
                    // entering element: grow into place from its landing spot
                    moves.push({el, transform: 'scale(0.92)', fade: true});
                    return
                }

                const
                    dx = first.left - last.left,
                    dy = first.top  - last.top,
                    sx = last.width  > 0 ? first.width  / last.width  : 1,
                    sy = last.height > 0 ? first.height / last.height : 1;

                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005) {
                    moves.push({el, transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`})
                }
            });

            if (moves.length < 1) {
                return false
            }

            // the observability signal (`neo-dashboard-dock-animating`) is OWNED by the
            // worker-side Neo.dashboard.DockMotionSignal (counted lifecycle) — consumers
            // bracket enter/leave around this awaited promise; the addon never toggles it
            // (cleanup still strips the legacy `dock-animating` class defensively)

            // Invert: place every survivor on its old geometry, entering panes at their birth state
            moves.forEach(({el, transform, fade}) => {
                el.style.transformOrigin = 'top left';
                el.style.transition      = 'none';
                el.style.transform       = transform;
                fade && (el.style.opacity = '0.001')
            });

            await new Promise(resolve => requestAnimationFrame(resolve));

            // Play: release to the new geometry in one composited transition
            moves.forEach(({el}) => {
                el.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
                el.style.transform  = '';
                el.style.opacity    = ''
            });

            // resolve AFTER the motion completes, so an awaiting consumer's signal bracket
            // (DockMotionSignal enter/leave) covers the true animation window; the idempotent
            // cleanup owns every temporary visual mutation (the hardening contract)
            await new Promise(resolve => setTimeout(resolve, duration + 50));

            cleanup();

            return true
        } catch (e) {
            // fail-safe: animation errors must never wedge the layout — land instantly
            cleanup();

            return false
        }
    }
}

export default Neo.setupClass(DockFlip);
