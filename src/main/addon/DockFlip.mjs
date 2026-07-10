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
     * @param {Object} opts
     * @param {String} opts.hostId            The dock host element id
     * @param {String} opts.markerPrefix      The marker-class prefix used in `captureFirst()`
     * @param {Number} [opts.duration=280]    Transition duration in ms (the design language's standard-decelerate beat)
     * @param {String} [opts.easing='cubic-bezier(0,0,0.2,1)'] Transition timing function
     * @param {Number} [opts.maxFrames=15]    Bounded frame-poll for the new tree to appear
     * @returns {Promise<Boolean>} true if an animation played, false on any instant-landing path
     */
    async play({hostId, markerPrefix, duration = 280, easing = 'cubic-bezier(0,0,0.2,1)', maxFrames = 15}) {
        const first = this.#firstRects[hostId];

        delete this.#firstRects[hostId];

        if (!first?.rects.size || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return false
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

            const moves = [];

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

            setTimeout(() => {
                moves.forEach(({el}) => {
                    el.style.transition      = '';
                    el.style.transformOrigin = ''
                })
            }, duration + 50);

            return true
        } catch (e) {
            // fail-safe: animation errors must never wedge the layout — land instantly
            return false
        }
    }
}

export default Neo.setupClass(DockFlip);
