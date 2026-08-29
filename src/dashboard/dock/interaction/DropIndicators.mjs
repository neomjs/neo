import Component             from '../../../component/Base.mjs';
import Container             from '../../../container/Base.mjs';
import NeoArray              from '../../../util/Array.mjs';
import {isValidCandidateSet} from '../model/PreviewContract.mjs';

/**
 * @summary The drag-time drop-indicator menu: renders every valid drop option simultaneously —
 * a 5-position cross on the hovered zone plus container edge chips — from a producer candidate set.
 *
 * The §06 disposition of the dock-choreography design artifact makes the indicator-overlay menu
 * the PRIMARY drag affordance ("show the menu, never make them guess"); pointer-zone inference
 * demotes to the fallback tier. This component is that menu's render half:
 *
 * - **Input** is a `neo.dock.candidates.v1` payload ({@link Neo.dashboard.dock.interaction.PreviewProducer#produceCandidates})
 *   plus the positioning host's viewport rect. Both are transient geometry — nothing here reads
 *   the DOM, touches a persisted document, or owns a pointer.
 * - **Selection is geometric, not DOM-eventing.** The drag proxy rides between the pointer and
 *   every element underneath, so DOM hover on indicators is unreliable mid-drag by construction.
 *   Instead the owning workspace threads its per-frame drag pointer into {@link #updatePointer};
 *   the component hit-tests its OWN computed indicator rects (it positioned them, so it knows
 *   them) and marks the hit candidate active. One pointer stream, one selection truth — the
 *   sort-zone drag lifecycle stays the single event source (no parallel drag system), and the
 *   whole layer is pointer-transparent (CSS `pointer-events: none`) and `aria-hidden` (the drag
 *   gesture is the semantic act; this menu is its visual feedback).
 * - **Commit-free.** The active candidate's `preview` is a complete `dockPreview.v1` payload; the
 *   workspace routes it to the preview renderer on hover and through `previewToOperation` on
 *   drop. This component never converts, commits, or mutates — it is a lit menu.
 * - **Object permanence.** The nine indicator children (5 cross + 4 chips) are created once and
 *   repositioned via style updates, never recreated per zone — so the cross GLIDES between zones
 *   under the `--dock-transition-*` motion contract instead of popping. Visibility is cls-based
 *   (warm DOM), mirroring the reveal overlay.
 * - **Fail closed.** A malformed candidate set or a missing host rect hides the layer
 *   ({@link module:dockPreviewContract.isValidCandidateSet}) rather than guessing coordinates.
 *
 * @class Neo.dashboard.dock.interaction.DropIndicators
 * @extends Neo.container.Base
 * @see Neo.dashboard.dock.interaction.PreviewProducer
 * @see Neo.dashboard.dock.interaction.TabSortZone
 * @see learn/agentos/DockZoneModel.md
 */
class DropIndicators extends Container {
    static config = {
        /**
         * The overlay positioning, visibility, and complete indicator skin live in the shared
         * dashboard container sheet. Declaring it here keeps every target window paint-complete,
         * including bare popup viewports whose app shell does not create a dashboard workspace.
         * @member {String[]} additionalThemeFiles
         */
        additionalThemeFiles: ['Neo.dashboard.Container'],
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.DropIndicators'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.DropIndicators',
        /**
         * @member {String} ntype='dashboard-dock-drop-indicators'
         * @protected
         */
        ntype: 'dashboard-dock-drop-indicators',
        /**
         * @member {String[]} baseCls=['neo-dashboard-dock-drop-indicators']
         */
        baseCls: ['neo-dashboard-dock-drop-indicators'],
        /**
         * The currently selected candidate ({position|edge, preview}) or null. Driven by
         * {@link #updatePointer}; settable directly for programmatic/tour selection. Fires
         * `dropIndicatorActiveChange` on every flip — the workspace's hook for routing the
         * candidate preview into the renderer.
         * @member {Object|null} activeCandidate_=null
         * @reactive
         */
        activeCandidate_: null,
        /**
         * The current candidate set (`neo.dock.candidates.v1`) to render, or null to hide
         * the whole layer. Runtime-only drag state — never persisted.
         * @member {Object|null} candidateSet_=null
         * @reactive
         */
        candidateSet_: null,
        /**
         * Edge length in px of one container edge chip. Non-reactive config — tunable per app
         * (`Neo.overwrites`), per instance, or per subclass (the producer-threshold rationale).
         * @member {Number} chipSize=26
         */
        chipSize: 26,
        /**
         * Inset in px of an edge chip from its container border.
         * @member {Number} chipInset=10
         */
        chipInset: 10,
        /**
         * The viewport rect ({x, y, width, height}) of the element this layer positions inside.
         * Candidate rects arrive in viewport space (measured `DOMRect`s); indicator styles are
         * layer-local — this rect is the conversion origin. Re-set it when the host moves/resizes.
         * @member {Object|null} hostRect_=null
         * @reactive
         */
        hostRect_: null,
        /**
         * Gap in px between the cross center and each directional indicator.
         * @member {Number} indicatorGap=6
         */
        indicatorGap: 6,
        /**
         * Edge length in px of one cross indicator square.
         * @member {Number} indicatorSize=32
         */
        indicatorSize: 32,
        /**
         * Absolute-positioned children own their geometry; the layer imposes no flow layout.
         * @member {Object} layout={ntype:'base'}
         */
        layout: {ntype: 'base'}
    }

    /**
     * Layer-computed indicator geometry from the last candidate-set sync:
     * Map<candidateKey, {rect: {x, y, width, height}, candidate}> in VIEWPORT space —
     * the hit-test source. Cleared whenever the layer hides.
     * @member {Map} #indicatorRects
     * @private
     */
    #indicatorRects = new Map()

    /**
     * Seeds the nine persistent indicator children — 5 cross positions + 4 edge chips. They are
     * pure visuals (the layer never owns pointer events); `syncIndicators()` governs visibility
     * from `onConstructed()` on.
     * @param {Object} config
     */
    construct(config={}) {
        if (!config.items) {
            config.items = [
                ...['center', 'top', 'right', 'bottom', 'left'].map(position => ({
                    module      : Component,
                    candidateKey: `cross-${position}`,
                    cls         : ['neo-dashboard-dock-drop-indicator', `neo-dashboard-dock-drop-indicator-${position}`, 'neo-dashboard-dock-drop-indicator-off']
                })),
                ...['top', 'right', 'bottom', 'left'].map(edge => ({
                    module      : Component,
                    candidateKey: `chip-${edge}`,
                    cls         : ['neo-dashboard-dock-drop-chip', `neo-dashboard-dock-drop-chip-${edge}`, 'neo-dashboard-dock-drop-indicator-off']
                }))
            ]
        }

        super.construct(config);

        this.getVdomRoot()['aria-hidden'] = 'true'
    }

    /**
     * Marks the active indicator child and notifies the workspace: fires
     * `dropIndicatorActiveChange` with the candidate (or null) so the owner can route the
     * candidate's preview into the renderer / clear it.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetActiveCandidate(value, oldValue) {
        if (oldValue === undefined && !value) return;

        let me       = this,
            activeId = value?.preview?.previewId ?? null;

        me.items?.forEach(child => {
            if (child.candidateKey) {
                let candidate = me.#indicatorRects.get(child.candidateKey)?.candidate,
                    cls       = child.cls || [];

                NeoArray[candidate && candidate.preview?.previewId === activeId ? 'add' : 'remove'](cls, 'neo-dashboard-dock-drop-indicator-active');
                child.set({cls})
            }
        });

        me.fire('dropIndicatorActiveChange', {candidate: value ?? null, indicators: me, previous: oldValue ?? null})
    }

    /**
     * Re-syncs the indicator children and resolves whether the previous active candidate
     * survived the new set (same `previewId`), clearing it otherwise — the cross moving to a
     * different zone must not keep a stale selection lit.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetCandidateSet(value, oldValue) {
        if (oldValue === undefined) return;

        let me     = this,
            active = me.activeCandidate;

        me.syncIndicators();

        if (active) {
            me.activeCandidate = me.findCandidate(active.preview?.previewId)
        }
    }

    /**
     * Repositions on host geometry changes without touching the candidate truth.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetHostRect(value, oldValue) {
        oldValue !== undefined && this.syncIndicators()
    }

    /**
     * Hides the menu and clears the selection — the drag-terminal path (drop, escape, cancel).
     */
    clear() {
        this.set({activeCandidate: null, candidateSet: null})
    }

    /**
     * Resolves a candidate from the CURRENT set by its preview id, or null.
     * @param {String|null} previewId
     * @returns {Object|null}
     */
    findCandidate(previewId) {
        if (!previewId) return null;

        for (let {candidate} of this.#indicatorRects.values()) {
            if (candidate?.preview?.previewId === previewId) {
                return candidate
            }
        }

        return null
    }

    /**
     * Finds the nearest integer pointer coordinate inside a candidate's rendered rect that
     * resolves back to that candidate under the layer's live overlap precedence.
     * @summary Lets programmatic pointer choreography target a visible part of an indicator instead
     * of assuming its center is reachable when a higher root-edge chip overlaps it.
     * @param {String|null} previewId
     * @returns {{x: Number, y: Number}|null}
     */
    getCandidateHitPoint(previewId) {
        let target = null;

        for (let entry of this.#indicatorRects.values()) {
            if (entry.candidate?.preview?.previewId === previewId) {
                target = entry;
                break
            }
        }

        if (!target) return null;

        let {height, width, x, y} = target.rect,
            center                = {x: Math.round(x + width / 2), y: Math.round(y + height / 2)},
            best                  = null,
            bestDistance          = Infinity,
            maxX                  = Math.floor(x + width),
            maxY                  = Math.floor(y + height),
            point, distance;

        for (let pointY = Math.ceil(y); pointY <= maxY; pointY++) {
            for (let pointX = Math.ceil(x); pointX <= maxX; pointX++) {
                point = {x: pointX, y: pointY};

                if (this.hitTest(point)?.preview?.previewId === previewId) {
                    distance = (pointX - center.x) ** 2 + (pointY - center.y) ** 2;

                    if (distance < bestDistance) {
                        best         = point;
                        bestDistance = distance
                    }
                }
            }
        }

        return best
    }

    /**
     * @summary Pure viewport-space hit-test against the computed indicator rects.
     *
     * No DOM read: the layer positioned every indicator from rect inputs, so the same math
     * answers "which indicator is under the pointer". Iterates in REVERSE render order so an
     * overlap resolves to the visually topmost indicator (chips render after — above — the
     * cross). Returns the hit candidate, or null.
     * @param {Object|null} pointer {x, y} viewport-space pointer
     * @returns {Object|null}
     */
    hitTest(pointer) {
        if (!pointer || typeof pointer.x !== 'number' || typeof pointer.y !== 'number') return null;

        let entries = [...this.#indicatorRects.values()],
            index;

        for (index = entries.length - 1; index >= 0; index--) {
            let {candidate, rect} = entries[index];

            if (pointer.x >= rect.x && pointer.x <= rect.x + rect.width &&
                pointer.y >= rect.y && pointer.y <= rect.y + rect.height) {
                return candidate
            }
        }

        return null
    }

    /**
     * Initial visibility pass: the layer (and every indicator) starts hidden — a candidate set
     * supplied at create time syncs here, after the container built its items.
     */
    onConstructed() {
        super.onConstructed();
        this.syncIndicators()
    }

    /**
     * @summary Recomputes indicator geometry + child styles from the current candidate set.
     *
     * Fail-closed: an invalid set or host rect hides the layer. Visibility is cls-toggled (warm
     * DOM — the show/hide and glide transitions run under the motion contract; a `display` flip
     * would kill them). Cross indicators center-cluster on the hovered zone; chips sit inset at
     * the root's edge midpoints. Child styles are layer-local (viewport → host conversion via
     * `hostRect`); the hit-test map stays in viewport space, matching the drag pointer.
     * @protected
     */
    syncIndicators() {
        let me                                                           = this,
            {chipInset, chipSize, hostRect, indicatorGap, indicatorSize} = me,
            set                                                          = me.candidateSet,
            cls                                                          = me.cls || [],
            validHost                                                    = !!hostRect && [hostRect.x, hostRect.y].every(v => typeof v === 'number' && !Number.isNaN(v)),
            visible                                                      = validHost && isValidCandidateSet(set),
            placements                                                   = new Map();

        me.#indicatorRects.clear();

        NeoArray[visible ? 'remove' : 'add'](cls, 'neo-dashboard-dock-drop-indicators-hidden');
        me.set({cls});

        if (visible) {
            let zone    = set.zone.rect,
                centerX = zone.x + zone.width  / 2,
                centerY = zone.y + zone.height / 2,
                step    = indicatorSize + indicatorGap,
                offsets = {
                    'cross-center': [0, 0],
                    'cross-top'   : [0, -step],
                    'cross-right' : [step, 0],
                    'cross-bottom': [0, step],
                    'cross-left'  : [-step, 0]
                };

            set.cross.forEach(candidate => {
                let key      = `cross-${candidate.position}`,
                    [dx, dy] = offsets[key];

                placements.set(key, {
                    candidate,
                    rect: {
                        x     : centerX + dx - indicatorSize / 2,
                        y     : centerY + dy - indicatorSize / 2,
                        width : indicatorSize,
                        height: indicatorSize
                    }
                })
            });

            if (set.root) {
                let root    = set.root.rect,
                    rootX   = root.x + root.width  / 2,
                    rootY   = root.y + root.height / 2,
                    chipPos = {
                        top   : [rootX - chipSize / 2, root.y + chipInset],
                        right : [root.x + root.width - chipInset - chipSize, rootY - chipSize / 2],
                        bottom: [rootX - chipSize / 2, root.y + root.height - chipInset - chipSize],
                        left  : [root.x + chipInset, rootY - chipSize / 2]
                    };

                set.root.chips.forEach(candidate => {
                    let [x, y] = chipPos[candidate.edge];

                    placements.set(`chip-${candidate.edge}`, {
                        candidate,
                        rect: {x, y, width: chipSize, height: chipSize}
                    })
                })
            }
        }

        me.items?.forEach(child => {
            let key = child.candidateKey;

            if (!key) return;

            let placement = placements.get(key),
                childCls  = child.cls || [];

            NeoArray[placement ? 'remove' : 'add'](childCls, 'neo-dashboard-dock-drop-indicator-off');

            if (placement) {
                me.#indicatorRects.set(key, placement);

                child.set({
                    cls  : childCls,
                    style: {
                        ...child.style,
                        height: `${placement.rect.height}px`,
                        left  : `${placement.rect.x - hostRect.x}px`,
                        top   : `${placement.rect.y - hostRect.y}px`,
                        width : `${placement.rect.width}px`
                    }
                })
            } else {
                child.set({cls: childCls})
            }
        })
    }

    /**
     * @summary The per-frame drag input: hit-tests the pointer and updates the active candidate.
     *
     * The owning workspace calls this from its drag-move stream (`dockCrossZoneDragMove`); the
     * return value is the workspace's preview-routing input for the frame — the §06 primary tier.
     * A null return means no indicator is hovered and the pointer-inference fallback tier applies.
     * @param {Object|null} pointer {x, y} viewport-space pointer
     * @returns {Object|null} the active candidate, or null
     */
    updatePointer(pointer) {
        let candidate = this.hitTest(pointer);

        this.activeCandidate = candidate;

        return candidate
    }
}

export default Neo.setupClass(DropIndicators);
