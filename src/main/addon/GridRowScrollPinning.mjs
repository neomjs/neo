import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main Thread Addon for High-Performance Grid Row Scroll Pinning.
 *
 * This addon intercepts VDOM deltas for grid rows just before they are applied to the DOM.
 * It compares the `scrollTop` state of the App Worker (when the deltas were generated)
 * against the actual, current `scrollTop` of the Grid Body in the Main Thread.
 *
 * If there is a discrepancy (e.g., due to fast native scrolling), it surgically modifies
 * the `translate3d` CSS transform values of the row deltas inline. This visually "pins"
 * the rows to their correct physical position on the screen, completely eliminating
 * scroll thrashing and white flashes during rapid scrolling.
 *
 * @class Neo.main.addon.GridRowScrollPinning
 * @extends Neo.main.addon.Base
 */
class GridRowScrollPinning extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GridRowScrollPinning'
         * @protected
         */
        className: 'Neo.main.addon.GridRowScrollPinning',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'unregister'
            ]
        }
    }

    /**
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.main.DeltaUpdates.on('update', this.onDeltaUpdate, this)
    }

    /**
     * @param {Object} data The event payload from Neo.main.DeltaUpdates
     * @protected
     */
    onDeltaUpdate(data) {
        let me             = this,
            {deltas, meta} = data;

        if (!meta || !deltas) {
            return
        }

        me.registrations.forEach(registration => {
            let bodyMeta = meta[registration.bodyId];

            if (bodyMeta) {
                let actualScrollTop = DomAccess.getElement(registration.bodyId)?.scrollTop || 0,
                    deltaY          = actualScrollTop - bodyMeta.scrollTop;

                // Engage pinning if the worker is off by more than 2 rows
                if (Math.abs(deltaY) > (bodyMeta.rowHeight * 2)) {
                    me.pinRows(deltas, registration.bodyId, deltaY)
                }
            }
        })
    }

    /**
     * Surgically modifies the translate3d string for row updates.
     * @param {Object[]} deltas
     * @param {String} bodyId
     * @param {Number} deltaY
     * @protected
     */
    pinRows(deltas, bodyId, deltaY) {
        let i        = 0,
            len      = deltas.length,
            rowIdRef = bodyId + '__row-',
            delta, transformMatch, currentY;

        for (; i < len; i++) {
            delta = deltas[i];

            // Only intercept updateNode actions for rows that have style.transform changes
            if (
                delta.action === 'updateNode' && 
                delta.id?.startsWith(rowIdRef) && 
                delta.style?.transform
            ) {
                // Parse the existing Y value from translate3d(0px, 150px, 0px)
                transformMatch = delta.style.transform.match(/translate3d\(0px,\s*(\d+)px,\s*0px\)/);

                if (transformMatch && transformMatch[1]) {
                    currentY = parseInt(transformMatch[1], 10);
                    // Apply the inline mutation
                    delta.style.transform = `translate3d(0px, ${currentY + deltaY}px, 0px)`
                }
            }
        }
    }

    /**
     * Registers a grid for row scroll pinning.
     * @param {Object} data
     * @param {String} data.bodyId The ID of the grid body
     * @param {String} data.id     Unique identifier for the registration (e.g. ScrollManager id)
     */
    register({bodyId, id}) {
        this.registrations.set(id, {bodyId, id})
    }

    /**
     * Unregisters a grid.
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        this.registrations.delete(id)
    }
}

export default Neo.setupClass(GridRowScrollPinning);