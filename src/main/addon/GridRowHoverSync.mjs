import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Synchronizes row hover states across multiple grid bodies using a passive, performance-optimized
 * native HTML event bridge. Eliminates the need for continuous mousemove tracking or heavy SCSS generation.
 * Coordinates hover suspension and resumption during scroll virtualization to prevent layout thrashing
 * and ensure cross-body row consistency.
 * @class Neo.main.addon.GridRowHoverSync
 * @extends Neo.main.addon.Base
 */
class GridRowHoverSync extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GridRowHoverSync'
         * @protected
         */
        className: 'Neo.main.addon.GridRowHoverSync',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'resumeHover',
                'suspendHover',
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
     * Reacts to native row exit boundaries. Caches stationary coordinates passively and features an
     * aggressive DOM sweep to eradicate stuck virtualization artifacts caused by rapid VDOM node recycling.
     * @param {String} id
     * @param {Event}  event
     */
    onMouseOut(id, event) {
        let registration = this.registrations.get(id);
        if (registration) {
            registration.lastX = event.clientX;
            registration.lastY = event.clientY;
        }

        let row = event.target.closest('.neo-grid-row');
        
        if (row && row.dataset.recordId) {
            let relatedRow = event.relatedTarget && event.relatedTarget.closest('.neo-grid-row');
            
            // Bailout: Pointer is still inside the SAME physiological row
            if (relatedRow && relatedRow.dataset.recordId === row.dataset.recordId) {
                return;
            }

            if (registration) {
                // Aggressively clear ALL hover states in the grid.
                // This eliminates any "stuck" states caused by VDOM row recycling during scroll virtualization.
                registration.wrapperNode
                    .querySelectorAll('.neo-hover')
                    .forEach(r => r.classList.remove('neo-hover'));
            }
        }
    }

    /**
     * Reacts to native row entry boundaries. Applies the synchronous cross-body highlight class
     * while utilizing an identical aggressive DOM sweep architecture to guarantee prior-state cleanliness.
     * @param {String} id
     * @param {Event}  event
     */
    onMouseOver(id, event) {
        let registration = this.registrations.get(id);
        if (registration) {
            registration.lastX = event.clientX;
            registration.lastY = event.clientY;
        }

        let row = event.target.closest('.neo-grid-row');
        
        if (row && row.dataset.recordId) {
            let relatedRow = event.relatedTarget && event.relatedTarget.closest('.neo-grid-row');
            
            // Bailout: Pointer just came from the SAME physiological row
            if (relatedRow && relatedRow.dataset.recordId === row.dataset.recordId) {
                return;
            }

            if (registration) {
                // Sweep any leftover stuck states first, just in case a previous sequence bypassed onMouseOut
                registration.wrapperNode
                    .querySelectorAll('.neo-hover')
                    .forEach(r => r.classList.remove('neo-hover'));

                registration.wrapperNode
                    .querySelectorAll(`.neo-grid-row[data-record-id="${row.dataset.recordId}"]`)
                    .forEach(r => r.classList.add('neo-hover'));
            }
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.wrapperId
     */
    register({id, wrapperId}) {
        let me = this,
            wrapperNode = DomAccess.getElement(wrapperId),
            registration;

        if (me.registrations.has(id)) {
            me.unregister({id});
        }

        if (wrapperNode) {
            registration = {
                id,
                wrapperId,
                wrapperNode,
                mouseOutListener : me.onMouseOut.bind(me, id),
                mouseOverListener: me.onMouseOver.bind(me, id)
            };

            wrapperNode.addEventListener('mouseout',  registration.mouseOutListener);
            wrapperNode.addEventListener('mouseover', registration.mouseOverListener);
            
            me.registrations.set(id, registration);
        }
    }

    /**
     * Resolves layout desynchronization by artificially injecting a synthetic mouseover event
     * into the native DOM. Called by the App Worker specifically when a scroll operation finalizes,
     * ensuring the pointer hit-test accurately pierces the newly removed .neo-is-scrolling state block.
     * @param {Object} data
     * @param {String} data.id
     */
    async resumeHover({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration && registration.lastX !== undefined) {
            // Delay hit-testing to ensure the App Worker's VDOM update (removing pointer-events: none)
            // has successfully flushed and painted to the active DOM.
            await me.timeout(100);

            let element = document.elementFromPoint(registration.lastX, registration.lastY);

            // Re-bootstrap the semantic mouseover state organically
            if (element) {
                let event = new MouseEvent('mouseover', {
                    bubbles   : true,
                    cancelable: true,
                    clientX   : registration.lastX,
                    clientY   : registration.lastY,
                    view      : window
                });
                
                element.dispatchEvent(event);
            }
        }
    }

    /**
     * Drops all active hover records. Primarily invoked when a scroll interaction starts to visually
     * decouple the mouse resting state from the rapidly advancing row virtualization buffer.
     * @param {Object} data
     * @param {String} data.id
     */
    suspendHover({id}) {
        let registration = this.registrations.get(id);

        if (registration) {
            registration.wrapperNode
                .querySelectorAll('.neo-hover')
                .forEach(r => r.classList.remove('neo-hover'));
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            registration.wrapperNode.removeEventListener('mouseout',  registration.mouseOutListener);
            registration.wrapperNode.removeEventListener('mouseover', registration.mouseOverListener);
            me.registrations.delete(id);
        }
    }
}

export default Neo.setupClass(GridRowHoverSync);
