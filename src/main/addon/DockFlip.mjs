import Base from './Base.mjs';

/**
 * Motion thresholds shared by the landed-in-place discriminator (`hasLandedInPlace`) and the
 * invert loop inside `play()`: position deltas in CSS px, scale deltas as unitless ratios.
 */
const MOTION_EPSILON_POSITION = 0.5,
      MOTION_EPSILON_SCALE    = 0.005;

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
 * the DOM nodes are new. Entering elements (no First rect, or a First captured without
 * presentable area — a mounted-but-hidden card) fade/scale in from their landing spot;
 * zero-area Lasts have nothing to present and land instantly; exiting elements are the
 * outgoing tree's problem and need no animation.
 *
 * Native atomic cross-boundary moves preserve the exact marker nodes. That branch skips the
 * replacement-tree detach poll and, when the First rect would be clipped by the destination,
 * temporarily fixes the same node to its Last viewport rect before applying the inverse. The
 * real parent and clipping contract remain untouched; unsafe containing blocks land instantly.
 *
 * Presentation-only by contract: the committed document never waits on motion — a failed or
 * skipped animation lands the final layout instantly (every path here is fail-safe), and
 * `prefers-reduced-motion: reduce` renders the instant path by construction.
 *
 * Starvation-proof by contract, two layers for two starvation classes:
 * 1. HIDDEN documents (`document.hidden === true` — agent browser panes, background tabs)
 *    instant-land at `play()` entry: motion is unpresentable there by definition, rAF is
 *    never serviced, AND main-thread timers are visibility-clamped (>=1s, down to ~1
 *    wake/min under intensive throttling) — no in-page wait of any kind stays bounded.
 * 2. OCCLUDED-but-visible windows service no frames but keep normal timer clamps, so every
 *    frame wait inside `play()` races the native rAF arm against a timer dam (`#nextFrame`).
 *    Frames win in every presenting document, keeping motion frame-locked; the dam bounds
 *    the wait where no frame comes, degrading motion to the instant path while correctness
 *    and liveness hold.
 * Pre-repair, a raw `requestAnimationFrame` await wedged every awaiting consumer forever
 * (witnessed: the workstation tour preamble hung inside `refreshDockWorkspace`). Same law as
 * the ResizeObserver addon's timer-raced dispatch dam + hidden poll: paint-gated carriers
 * need a paint-independent arm.
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
     * First-phase marker, ancestor-lineage, stacking, and rect snapshots keyed by host id.
     * @member {Object} #firstSnapshots={}
     * @private
     */
    #firstSnapshots = {}

    /**
     * Active presentation cleanups. Destroy interrupts them before the base lifecycle tears
     * down the addon, so no fixed stage, inverse transform, class, or timer can outlive it.
     * @member {Set<Function>} #activeCleanups
     * @private
     */
    #activeCleanups = new Set()

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
     * @summary Captures one marker's ancestor identities through its owning dock host.
     * @param {HTMLElement} el
     * @param {HTMLElement} hostEl
     * @returns {HTMLElement[]}
     * @protected
     */
    captureAncestorLineage(el, hostEl) {
        const lineage = [];

        let current = el.parentElement;

        while (current) {
            lineage.push(current);

            if (current === hostEl) break;

            current = current.parentElement
        }

        return lineage
    }

    /**
     * @summary Reports whether a marker moved across any captured ancestor boundary.
     * @param {HTMLElement} el
     * @param {HTMLElement[]} firstLineage
     * @param {HTMLElement} hostEl
     * @returns {Boolean}
     * @protected
     */
    hasAncestorLineageChanged(el, firstLineage, hostEl) {
        const lineage = this.captureAncestorLineage(el, hostEl);

        return Boolean(firstLineage)
            && (lineage.length !== firstLineage.length
            || lineage.some((ancestor, index) => ancestor !== firstLineage[index])
            )
    }

    /**
     * @summary Returns whether the captured connected marker set has landed across an ancestor boundary.
     * @param {Map<String, HTMLElement>} firstMarkers
     * @param {Map<String, HTMLElement>} markers
     * @param {Map<String, HTMLElement[]>} firstLineages
     * @param {HTMLElement} hostEl
     * @returns {Boolean}
     * @protected
     */
    hasPreservedMarkerSet(firstMarkers, markers, firstLineages, hostEl) {
        const exactSet = firstMarkers?.size === markers.size
            && [...markers].every(([key, el]) => el.isConnected && firstMarkers.get(key) === el);

        // An exact unchanged-lineage set can still be the outgoing tree while an async delta is
        // pending. Any ancestor change is the falsifier that Neo's atomic boundary move landed.
        return exactSet && [...markers].some(([key, el]) =>
            this.hasAncestorLineageChanged(el, firstLineages.get(key), hostEl)
        )
    }

    /**
     * @summary Returns whether an exact, lineage-unchanged marker set has already landed in place.
     *
     * A committed same-node resize keeps every marker node AND its ancestor lineage, so the
     * lineage-based `hasPreservedMarkerSet()` can never classify it: the replacement-tree
     * branch would burn its whole detach poll on nodes that never detach, exposing the
     * committed layout unanimated before the inverse installs (the double-take). The
     * discriminator for that case is geometry, not identity — once a marker's current rect
     * differs from its First rect beyond the motion epsilons, the swap has landed in place
     * and the detach poll is pure exposed delay. Node-identical sets with UNCHANGED geometry
     * keep polling: that is the outgoing-tree case the stage-A comment guards.
     * @param {Map<String, HTMLElement>} firstMarkers
     * @param {Map<String, DOMRect>} firstRects
     * @param {Map<String, HTMLElement[]>} firstLineages
     * @param {Map<String, HTMLElement>} markers
     * @param {HTMLElement} hostEl
     * @returns {Boolean}
     * @protected
     */
    hasLandedInPlace(firstMarkers, firstRects, firstLineages, markers, hostEl) {
        const exactSet = firstMarkers?.size === markers.size
            && [...markers].every(([key, el]) => el.isConnected && firstMarkers.get(key) === el);

        if (!exactSet) {
            return false
        }

        // Any lineage change is a structural move — the lineage-based branch owns it.
        if ([...markers].some(([key, el]) => this.hasAncestorLineageChanged(el, firstLineages.get(key), hostEl))) {
            return false
        }

        return [...markers].some(([key, el]) => {
            const
                firstRect = firstRects.get(key),
                last      = el.getBoundingClientRect();

            if (!firstRect) {
                return false
            }

            const
                sx = last.width  > 0 ? firstRect.width  / last.width  : 1,
                sy = last.height > 0 ? firstRect.height / last.height : 1;

            return Math.abs(firstRect.left - last.left) > MOTION_EPSILON_POSITION
                || Math.abs(firstRect.top  - last.top)  > MOTION_EPSILON_POSITION
                || Math.abs(sx - 1) > MOTION_EPSILON_SCALE
                || Math.abs(sy - 1) > MOTION_EPSILON_SCALE
        })
    }

    /**
     * @summary Resolves the fixed-stage stacking value without lowering captured or effective numeric stacking.
     * @param {HTMLElement} el
     * @param {...String} capturedValues
     * @returns {String}
     * @protected
     */
    resolveFixedStageZIndex(el, ...capturedValues) {
        const
            computedValue = globalThis.getComputedStyle?.(el)?.zIndex,
            values        = [...capturedValues, computedValue]
                .map(value => String(value ?? '').trim())
                .filter(value => /^[+-]?\d+$/.test(value))
                .map(Number)
                .filter(Number.isFinite);

        return String(Math.max(2, ...values))
    }

    /**
     * @summary Finds the nearest ancestor that clips either axis between a marker and its dock host.
     * @param {HTMLElement} el
     * @param {HTMLElement} hostEl
     * @returns {Object|null}
     * @protected
     */
    getClippingContext(el, hostEl) {
        const readStyle = globalThis.getComputedStyle;

        if (!readStyle) return null;

        let current = el.parentElement;

        while (current) {
            const
                style     = readStyle(current),
                overflow  = style.overflow || 'visible',
                overflowX = style.overflowX || overflow,
                overflowY = style.overflowY || overflow,
                clips     = value => !['visible', 'initial', 'unset'].includes(value),
                clipsX    = clips(overflowX),
                clipsY    = clips(overflowY);

            if (clipsX || clipsY) {
                return {
                    clipsX,
                    clipsY,
                    el  : current,
                    rect: current.getBoundingClientRect()
                }
            }

            if (current === hostEl) break;

            current = current.parentElement
        }

        return null
    }

    /**
     * @summary Reports whether a First rect would extend beyond the destination clipping context.
     * @param {DOMRect} rect
     * @param {Object} clippingContext
     * @returns {Boolean}
     * @protected
     */
    isRectClipped(rect, clippingContext) {
        const
            clip       = clippingContext.rect,
            rectRight  = rect.right  ?? rect.left + rect.width,
            rectBottom = rect.bottom ?? rect.top  + rect.height,
            clipRight  = clip.right  ?? clip.left + clip.width,
            clipBottom = clip.bottom ?? clip.top  + clip.height,
            tolerance  = 0.5;

        return clippingContext.clipsX && (rect.left < clip.left - tolerance || rectRight > clipRight + tolerance)
            || clippingContext.clipsY && (rect.top < clip.top - tolerance || rectBottom > clipBottom + tolerance)
    }

    /**
     * @summary Verifies that fixed-position staging will remain viewport-relative instead of being trapped by a containing-block ancestor.
     * @param {HTMLElement} el
     * @returns {Boolean}
     * @protected
     */
    canUseFixedStage(el) {
        const readStyle = globalThis.getComputedStyle;

        if (!readStyle) return false;

        let current = el.parentElement;

        while (current) {
            const
                style      = readStyle(current),
                contain    = style.contain || '',
                willChange = (style.willChange || '').split(',').map(value => value.trim()),
                trapped    = style.transform && style.transform !== 'none'
                    || style.perspective && style.perspective !== 'none'
                    || style.filter && style.filter !== 'none'
                    || style.backdropFilter && style.backdropFilter !== 'none'
                    || /(?:^|\s)(?:layout|paint|strict|content)(?:\s|$)/.test(contain)
                    || style.contentVisibility && style.contentVisibility !== 'visible'
                    || willChange.some(value => ['transform', 'perspective', 'filter'].includes(value));

            if (trapped) return false;

            current = current.parentElement
        }

        return true
    }

    /**
     * @summary Captures every inline style DockFlip may mutate so cleanup restores the exact prior presentation.
     * @param {HTMLElement} el
     * @returns {Object}
     * @protected
     */
    captureInlineStyles(el) {
        return Object.fromEntries([
            'bottom',
            'boxSizing',
            'height',
            'left',
            'margin',
            'maxHeight',
            'maxWidth',
            'minHeight',
            'minWidth',
            'opacity',
            'position',
            'right',
            'top',
            'transform',
            'transformOrigin',
            'transition',
            'width',
            'zIndex'
        ].map(property => [property, el.style[property] ?? '']))
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
            hostEl   = document.getElementById(hostId),
            markers  = this.collectMarkers(hostId, markerPrefix),
            lineages = new Map(),
            rects    = new Map(),
            zIndexes = new Map();

        markers.forEach((el, key) => {
            lineages.set(key, this.captureAncestorLineage(el, hostEl));
            rects.set(key, el.getBoundingClientRect());
            zIndexes.set(key, this.resolveFixedStageZIndex(el, el.style.zIndex));
        });

        this.#firstSnapshots[hostId] = {els: [...markers.values()], lineages, markers, rects, zIndexes}
    }

    /**
     * @summary Interrupts every active presentation stage before the addon lifecycle is destroyed.
     * @returns {void}
     */
    destroy() {
        this.#activeCleanups.forEach(cancel => cancel());
        this.#activeCleanups.clear();
        this.#firstSnapshots = {};

        super.destroy()
    }

    /**
     * Converts one computed CSS time token to milliseconds. Exact zero is meaningful: the
     * reduced-motion contract collapses `--dock-transition-duration` to `0ms`, which must not
     * fall through to the visual fallback. Both CSS time units are accepted.
     * @param {String} value
     * @returns {Number}
     * @protected
     */
    parseDurationToken(value) {
        const match = String(value ?? '').trim().match(/(-?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)\s*\)?$/);

        return match
            ? Number(match[1]) * (match[2] === 's' ? 1000 : 1)
            : 0
    }

    /**
     * One frame boundary that cannot starve. The native rAF arm wins in every presenting
     * document (identical timing to a raw `requestAnimationFrame` await); the timer dam
     * bounds the wait in rendering-starved documents, where rAF callbacks are never serviced
     * and a raw await would wedge the caller forever. The dam result lets callers
     * distinguish a serviced frame from a starved tick: loops re-check DOM state either way
     * (delta application is message-driven and needs no frames), while the release path uses
     * a starved tick as its instant-landing signal — animating a document that cannot paint
     * would only hold transform-scaled mid-motion rects live for async measurers to read as
     * layout truth.
     *
     * The race disposes BOTH arms symmetrically (the sibling ResizeObserver dam's contract):
     * a frame win clears the timer, and a dam win cancels the pending rAF callback. Without
     * the cancellation, every timer-won wait in a frame-starved-but-visible window would
     * leave its callback queued — dock operations accumulate them unboundedly, and they all
     * fire in one burst when the window finally presents again.
     * @param {Number} [budgetMs=100] Generously above one healthy frame (17-34ms), far below
     * a perceivable stall — a presenting document virtually always wins with a real frame.
     * @returns {Promise<Boolean>} true when a real frame serviced the wait, false when the dam fired
     * @private
     */
    #nextFrame(budgetMs=100) {
        return new Promise(resolve => {
            let frameId   = null,
                timer     = setTimeout(() => {
                    timer = null;
                    globalThis.cancelAnimationFrame?.(frameId);
                    resolve(false)
                }, budgetMs);

            frameId = requestAnimationFrame(() => {
                if (timer !== null) {
                    clearTimeout(timer);
                    timer = null;
                    resolve(true)
                }
            })
        })
    }

    /**
     * Phase 2: wait for the new tree's marker elements, invert them onto their old geometry,
     * then play the transition to their new geometry. Safe to call unconditionally after a
     * swap — with no prior `captureFirst()` snapshot, or under reduced motion, it no-ops and
     * the layout simply lands.
     * Duration and easing resolve from the motion-contract tokens (`--dock-transition-duration`
     * / `--dock-transition-easing`) on the nearest descendant dashboard token scope — zero
     * local duration policy. Missing or invalid tokens fail safe to the instant path; a token
     * collapsed to `0ms` is the token-layer reduced-motion path.
     * @param {Object} opts
     * @param {String} opts.hostId            The dock host element id
     * @param {String} opts.markerPrefix      The marker-class prefix used in `captureFirst()`
     * @param {Number} [opts.maxFrames=15]    Bounded frame-poll for the new tree to appear.
     * Every poll tick rides `#nextFrame`, so the bound holds in TIME even where no frame is
     * ever serviced (maxFrames × dam budget) — not only in serviced-frame count
     * @param {Boolean} [opts.geometryOnly=false] Consumer-declared geometry-only projection:
     * no topology swap can be pending, so an exact, lineage-unchanged marker set whose rects
     * already moved may be classified as landed-in-place (`hasLandedInPlace`). Without this
     * declaration a geometry-moved same-parent set stays ambiguous by contract — an independent
     * geometry change can race a pending structural swap — and keeps the bounded wait.
     * @returns {Promise<Boolean>} true if an animation played (resolves AFTER the motion completes), false on any instant-landing path
     */
    async play({hostId, markerPrefix, maxFrames = 15, geometryOnly = false}) {
        const first = this.#firstSnapshots[hostId];

        let cancel,
            durationResolve = null,
            durationTimer   = null,
            hostEl,
            interrupted     = false,
            moves           = [],
            settled         = false;

        // One idempotent settlement path owns every temporary visual mutation. In particular,
        // a rejected post-invert frame must restore the final layout instead of preserving the
        // inverse transform or observability class indefinitely.
        const cleanup = (wasInterrupted = false) => {
            if (settled) return;

            interrupted ||= wasInterrupted;

            const resolveDuration = durationResolve;

            if (durationTimer !== null) {
                clearTimeout(durationTimer);
                durationTimer   = null;
                durationResolve = null
            }

            moves.forEach(({el, fixedStage, hadStageClass, styleSnapshot}) => {
                styleSnapshot && Object.entries(styleSnapshot).forEach(([property, value]) => {
                    el.style[property] = value
                });

                fixedStage && !hadStageClass && el.classList.remove('neo-dock-flip-fixed-stage')
            });

            hostEl?.classList.remove('dock-animating');

            hostEl = null;
            moves  = [];
            settled = true;

            this.#activeCleanups.delete(cancel);
            resolveDuration?.()
        };

        cancel = () => cleanup(true);

        delete this.#firstSnapshots[hostId];

        if (!first?.rects.size || this.isDestroyed) {
            return false
        }

        // A hidden document cannot present motion by definition — and it throttles the very
        // carriers a bounded wait could ride: rAF is never serviced, and main-thread timers
        // are visibility-clamped (>=1s per tick, down to ~1 wake/min under intensive
        // throttling), so even the timer dam degrades from milliseconds to minutes there
        // (witnessed: the pane tour preamble sat wedged in stage A at ~1 tick/min). The RO
        // addon keys its hidden poll on the same discriminator. Occluded-but-visible windows
        // keep normal timer clamps, so the dam below remains the carrier for that class.
        if (document.hidden) {
            return false
        }

        const
            firstLineages = first.lineages,
            firstMarkers  = first.markers,
            firstRects    = first.rects,
            firstZIndexes = first.zIndexes;

        try {
            // Both consumers pass a workspace host ABOVE the projected `.neo-dashboard`.
            // Custom properties inherit downward only, so reading the outer host silently loses
            // the contract and falls back. Resolve the actual token-bearing descendant instead.
            hostEl = document.getElementById(hostId);

            const
                tokenHost = hostEl?.matches?.('.neo-dashboard')
                    ? hostEl
                    : hostEl?.querySelector?.('.neo-dashboard') || hostEl,
                tokens    = tokenHost && globalThis.getComputedStyle?.(tokenHost),
                duration  = this.parseDurationToken(tokens?.getPropertyValue('--dock-transition-duration')),
                easing    = tokens?.getPropertyValue('--dock-transition-easing')?.trim();

            if (!(duration > 0) || !easing) {
                return false // token-layer reduced-motion collapse or missing contract: land instantly
            }

            let
                frame              = 0,
                markers            = this.collectMarkers(hostId, markerPrefix),
                preservedMarkerSet = this.hasPreservedMarkerSet(firstMarkers, markers, firstLineages, hostEl),
                landedInPlace      = geometryOnly && !preservedMarkerSet
                    && this.hasLandedInPlace(firstMarkers, firstRects, firstLineages, markers, hostEl);

            // stage A: the swap lands asynchronously through the delta pipeline — the OLD
            // tree's markers would satisfy a naive presence-poll instantly and measure
            // identical geometry. An exact preserved marker set is the native atomic-move path:
            // those nodes MUST remain connected, so it bypasses the outgoing-detach poll. A
            // consumer-declared geometry-only projection (a committed resize) bypasses it too:
            // those nodes never detach either, and the landed geometry (landedInPlace) is the
            // proof the swap already happened.
            if (!preservedMarkerSet && !landedInPlace) {
                while (frame < maxFrames && first.els.length > 0 && first.els.every(el => el.isConnected)) {
                    await this.#nextFrame();
                    frame++
                }
            }

            // stage B: now wait (bounded) for the NEW tree's markers to exist
            markers = this.collectMarkers(hostId, markerPrefix);

            while (markers.size < 1 && frame < maxFrames * 2) {
                await this.#nextFrame();
                frame++;
                markers = this.collectMarkers(hostId, markerPrefix)
            }

            if (markers.size < 1) {
                return false
            }

            if (this.isDestroyed) return false;

            // Replacement trees retain their settle frame. Preserved identities — and
            // landed-in-place resizes — are already in their committed Last geometry, so
            // delaying here would expose the clipped final tree for one paint before the
            // inverse transform is installed.
            if (!preservedMarkerSet && !landedInPlace) {
                await this.#nextFrame()
            }

            markers.forEach((el, key) => {
                const
                    firstRect = firstRects.get(key),
                    last      = el.getBoundingClientRect();

                // A zero-area Last does not present at its destination (hidden card, collapsed
                // box): there is no motion to show — the committed layout owns it.
                if (!(last.width > 0) || !(last.height > 0)) {
                    return
                }

                // An element without presentable First geometry is an entering element, not a
                // mover — including a zero-area capture (a mounted-but-hidden card at First
                // time). Inverting from a zero-area rect would install translate(-last.left,
                // -last.top) scale(0, 0): a box collapsed onto the viewport origin, presenting
                // blank staged frames until the transition escapes zero.
                if (!firstRect || !(firstRect.width > 0) || !(firstRect.height > 0)) {
                    // entering element: grow into place from its landing spot
                    moves.push({el, fixedStage: false, transform: 'scale(0.92)', fade: true, last});
                    return
                }

                const
                    dx                  = firstRect.left - last.left,
                    dy                  = firstRect.top  - last.top,
                    sx                  = firstRect.width  / last.width,
                    sy                  = firstRect.height / last.height,
                    preservedIdentity   = firstMarkers.get(key) === el && el.isConnected,
                    movedAcrossBoundary = preservedIdentity
                        && this.hasAncestorLineageChanged(el, firstLineages.get(key), hostEl),
                    clippingContext    = movedAcrossBoundary && this.getClippingContext(el, hostEl),
                    needsFixedStage   = clippingContext && this.isRectClipped(firstRect, clippingContext),
                    fixedStage        = needsFixedStage && this.canUseFixedStage(el);

                // A containing-block ancestor can trap a fixed descendant inside the same bad
                // clip. In that unsafe case, snap this pane to Last instead of animating a false
                // blank frame; unrelated safe moves may still play.
                if (needsFixedStage && !fixedStage) return;

                if (Math.abs(dx) > MOTION_EPSILON_POSITION || Math.abs(dy) > MOTION_EPSILON_POSITION || Math.abs(sx - 1) > MOTION_EPSILON_SCALE || Math.abs(sy - 1) > MOTION_EPSILON_SCALE) {
                    moves.push({
                        el,
                        firstZIndex: firstZIndexes.get(key),
                        fixedStage,
                        last,
                        transform  : `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
                    })
                }
            });

            if (moves.length < 1) {
                return false
            }

            // the observability signal (`neo-dashboard-dock-animating`) is OWNED by the
            // worker-side Neo.dashboard.dock.projection.MotionSignal (counted lifecycle) — consumers
            // bracket enter/leave around this awaited promise; the addon never toggles it
            // (cleanup still strips the legacy `dock-animating` class defensively)

            // Invert: place every survivor on its old geometry, entering panes at their birth state
            this.#activeCleanups.add(cancel);

            moves.forEach(move => {
                const {el, firstZIndex, fixedStage, last, transform, fade} = move;

                move.hadStageClass = el.classList.contains('neo-dock-flip-fixed-stage');
                move.styleSnapshot = this.captureInlineStyles(el);

                if (fixedStage) {
                    el.classList.add('neo-dock-flip-fixed-stage');

                    const zIndex = this.resolveFixedStageZIndex(
                        el,
                        firstZIndex,
                        move.styleSnapshot.zIndex
                    );

                    Object.assign(el.style, {
                        bottom   : 'auto',
                        boxSizing: 'border-box',
                        height   : `${last.height}px`,
                        left     : `${last.left}px`,
                        margin   : '0',
                        maxHeight: 'none',
                        maxWidth : 'none',
                        minHeight: '0',
                        minWidth : '0',
                        position : 'fixed',
                        right    : 'auto',
                        top      : `${last.top}px`,
                        width    : `${last.width}px`,
                        zIndex
                    })
                }

                el.style.transformOrigin = 'top left';
                el.style.transition      = 'none';
                el.style.transform       = transform;
                fade && (el.style.opacity = '0.001')
            });

            // The invert must be committed by a real frame before the transition is released —
            // a starved tick here means the document is not painting, so there is no motion to
            // present: land instantly instead of transitioning into a void (and instead of
            // holding transform-scaled mid-motion rects live for async measurers to misread
            // as layout truth).
            const framed = await this.#nextFrame();

            if (!framed) {
                cleanup();

                return false
            }

            if (interrupted || this.isDestroyed) {
                cleanup(true);

                return false
            }

            // Play: release to the new geometry in one composited transition
            moves.forEach(({el, styleSnapshot}) => {
                el.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
                el.style.transform  = styleSnapshot.transform;
                el.style.opacity    = styleSnapshot.opacity
            });

            // resolve AFTER the motion completes, so an awaiting consumer's signal bracket
            // (DockMotionSignal enter/leave) covers the true animation window; the idempotent
            // cleanup owns every temporary visual mutation (the hardening contract)
            await new Promise(resolve => {
                durationResolve = resolve;
                durationTimer   = setTimeout(() => {
                    durationResolve = null;
                    durationTimer   = null;
                    resolve()
                }, duration + 50)
            });

            if (interrupted || this.isDestroyed) return false;

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
