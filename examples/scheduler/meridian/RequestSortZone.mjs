import BoardSortZone from '../../../src/board/SortZone.mjs';
import {clock}       from './Night.mjs';

/**
 * @summary Carries one observing request from its native Board into the telescope schedule. The proposed slot
 * belongs to the desk until its drop is accepted. Sorting within the Board retains its normal single writer.
 * @class Neo.examples.scheduler.meridian.RequestSortZone
 * @extends Neo.board.SortZone
 */
class RequestSortZone extends BoardSortZone {
    static config = {
        /** @member {String} className @protected */
        className: 'Neo.examples.scheduler.meridian.RequestSortZone',
        /** @member {Boolean} allowOverdrag The card proxy follows the pointer beyond the crew board. */
        allowOverdrag: true,
        /** @member {Object} dropZoneIdentifier The only foreign surface receiving a request. */
        dropZoneIdentifier: {cls: ['meridian-scheduler']}
    }

    #token = null
    #overSlot = false

    /** @summary Marks the active request as a drag handle and keeps reference programmes as ordinary cards.
     * @param {Neo.board.Card} card
     * @param {Boolean} [draggable=true]
     */
    armCard(card, draggable=true) { super.armCard(card, draggable && card.record?.id === 'arc17') }

    /** @summary A single request chooses one observing slot even if the Board has other records selected.
     * @param {Object} lead
     * @returns {Object[]}
     */
    getSelectedDragRecords(lead) { return lead ? [lead] : [] }

    /** @summary Uses the native proxy, with a small verdict beside the original card.
     * @returns {Object}
     */
    getDragProxyConfig() {
        const config = super.getDragProxyConfig();
        config.cls.push('meridian-request-proxy');
        return config
    }

    /** @summary Adds the provisional verdict to the card clone, outside the committed Board.
     * @returns {Object|null}
     */
    getDragProxyVdom() {
        const vdom = super.getDragProxyVdom();
        if (vdom) {
            vdom.cn.push({cls: ['meridian-drag-caption'], cn: [
                {tag: 'strong', cls: ['meridian-drag-head'], text: 'Compare telescope slots'},
                {tag: 'span', cls: ['meridian-drag-exposure'], text: ''},
                {tag: 'span', cls: ['meridian-drag-outcome'], text: ''}
            ]});
            vdom.data = {...vdom.data, verdict: 'neutral'}
        }
        return vdom
    }

    /** @summary Pins the lifted request and its starting plan revision. @param {Object} data */
    async onDragStart(data) {
        const record = this.getCardFromPath(data.path)?.record;
        if (record) this.#token = this.owner.planningController?.beginRequest(record);
        try {
            await super.onDragStart(data)
        } catch (error) {
            this.#cancel();
            throw error
        }
    }

    /** @summary Previews the track beneath the pointer; an ordinary in-board move remains a board sort.
     * @param {Object} data
     */
    onDragMove(data) {
        if (this.dragEndActive || this.isDestroying || this.isDestroyed) return;

        const controller = this.owner.planningController,
              slot       = this.#token && controller.scheduler.slotAtPointer(data),
              overBoard  = !this.boundaryContainerRect || this.#insideBoard(data);

        if (slot || !overBoard) {
            // An earlier, asynchronous column entry must not replay its pointer over the newer telescope slot.
            this.pendingColumnMove = null;
            this.isOverDragging = false
        }
        if (slot) {
            this.#overSlot = true;
            const verdict = controller.previewRequest(this.#token, slot, {clientX: data.clientX, clientY: data.clientY});
            this.#caption(verdict);
            return this.#returnHome(data)
        }
        if (this.#overSlot) {
            this.#overSlot = false;
            controller.previewRequest(this.#token, null);
            this.#caption(null)
        }
        if (overBoard) return super.onDragMove(data)
    }

    /** @summary A normal entry chooses the insertion point under the pointer; returning from an external preview
     * restores the record's actual position in its column.
     * @param {Neo.board.Column} column
     * @param {Number|null} clientY Null for a return to the home slot.
     * @returns {Promise<Number>}
     */
    async getIndexAt(column, clientY) {
        return clientY === null ? this.getColumnCards(column).indexOf(this.dragComponent) : super.getIndexAt(column, clientY)
    }

    /** @summary Returns the lifted card's real node and gap to its home while the pointer compares a telescope. */
    async #returnHome(data) {
        const card = this.dragComponent, home = card?.parent?.parent;
        if (!home?.body || !this.columnRects) return;
        if (this.isEnteringColumn) {
            this.pendingColumnMove = data;
            return
        }
        if (home === this.activeColumn && this.currentIndex === this.getColumnCards(home).indexOf(card)) return;

        const entry = this.columnEntry = this.enterColumn(home, {clientY: null});
        try {
            await entry
        } finally {
            if (this.columnEntry === entry) this.columnEntry = null
        }
        if (this.pendingColumnMove && !this.dragEndActive) {
            const latest = this.pendingColumnMove;
            this.pendingColumnMove = null;
            return this.onDragMove(latest)
        }
    }

    /** @summary The source and the telescope never both commit a drop. Recheck the hit and the pinned request at release.
     * @param {Object} data
     */
    async processDragEnd(data) {
        const controller = this.owner.planningController,
              token      = this.#token,
              record     = this.dragRecord,
              slot       = !data.cancelled && token && controller.scheduler.slotAtPointer(data),
              outside    = slot || (Number.isFinite(data.clientX) && !this.#insideBoard(data));

        // A concurrent clearance move already reparented the real card. Its current column is now the home
        // slot the native sort restores its temporary DOM move to.
        const home = this.dragComponent?.parent?.parent;
        if (home && home.body === this.dragComponent.parent) this.startColumn = home;
        this.#token = null;
        this.#overSlot = false;
        let handedOff = false;
        try {
            await super.processDragEnd(outside ? {...data, cancelled: true} : data);
            if (slot && !this.isDestroyed && !controller.isDestroying && !controller.isDestroyed &&
                this.owner?.store?.get('arc17') === record) {
                controller.commitRequest(token, slot);
                handedOff = true
            }
        } finally {
            if (token && !handedOff && !controller.isDestroying && !controller.isDestroyed) controller.cancelRequest(token)
        }
    }

    /** @summary Revokes the verdict on a still-held proxy when another actor retires the desk's comparison.
     * @param {Object} token The invalidated comparison; a keyboard comparison never owns this proxy.
     */
    invalidateRequest(token) {
        if (token && token === this.#token) {
            this.#token = null;
            this.#overSlot = false;
            this.#caption(null, 'Plan changed · lift ARC-17 again')
        }
    }

    /** @summary Releases any candidate when the observing desk is destroyed. @param {...*} args */
    destroy(...args) {
        this.#cancel();
        super.destroy(...args)
    }

    #cancel() {
        const controller = this.owner?.planningController;
        if (this.#token && controller && !controller.isDestroying && !controller.isDestroyed) controller.cancelRequest(this.#token);
        this.#token = null;
        this.#overSlot = false
    }

    #insideBoard({clientX, clientY}) {
        const bounds = this.boundaryContainerRect;
        return bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom
    }

    #caption(verdict, idle='Compare telescope slots') {
        const proxy = this.dragProxy;
        if (!proxy || proxy.isDestroyed) return;
        const root        = proxy.getVdomRoot(), [headline, timing, outcome] = root.cn.at(-1).cn,
              state       = verdict ? (verdict.accepted ? 'accepted' : 'denied') : 'neutral',
              text        = verdict?.short || idle,
              exposure    = verdict ? `${clock(verdict.start)}–${clock(verdict.end)} UTC · ${verdict.fps} fps` : '',
              consequence = !verdict ? '' : verdict.accepted ?
                  `Camera free ${clock(verdict.release)} · ${verdict.delay ? `Mosaic +${verdict.delay} min` : 'Mosaic unchanged'}` :
                  `${verdict.samples} of ${verdict.fps * 120} event samples`;
        if (root.data?.verdict !== state || headline.text !== text || timing.text !== exposure || outcome.text !== consequence) {
            root.data = {...root.data, verdict: state};
            headline.text = text;
            timing.text = exposure;
            outcome.text = consequence;
            proxy.update()
        }
    }
}

export default Neo.setupClass(RequestSortZone);
