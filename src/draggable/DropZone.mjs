import Base from '../core/Base.mjs';

/**
 * @class Neo.draggable.DropZone
 * @extends Neo.core.Base
 */
class DropZone extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.DropZone'
         * @protected
         */
        className: 'Neo.draggable.DropZone',
        /**
         * @member {String} ntype='dropzone'
         * @protected
         */
        ntype: 'dropzone',
        /**
         * @member {Neo.component.Base} owner=null
         */
        owner: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            owner        = me.owner,
            domListeners = owner.domListeners;

        domListeners.push(
            {'drop'      : me.onDrop,      scope: me},
            {'drop:enter': me.onDropEnter, scope: me},
            {'drop:leave': me.onDropLeave, scope: me}
        );

        owner.domListeners = domListeners;
    }

    /**
     *
     * @param {String} name
     * @param {Object} data
     */
    fireOwnerEvent(name, data) {
        this.owner.fire(name, this.getDragData(data.dragZoneId));
    }

    /**
     *
     * @param {String} dragZoneId
     * @returns {Object|null}
     */
    getDragData(dragZoneId) {
        let dragZone = Neo.get(dragZoneId);

        if (dragZone) {
            return dragZone.data;
        }

        return null;
    }

    /**
     *
     * @param {Object} data
     */
    onDrop(data) {
        this.fireOwnerEvent('drop', data);
    }

    /**
     *
     * @param {Object} data
     */
    onDropEnter(data) {
        this.fireOwnerEvent('drop:enter', data);
    }

    /**
     *
     * @param {Object} data
     */
    onDropLeave(data) {
        this.fireOwnerEvent('drop:leave', data);
    }
}

Neo.applyClassConfig(DropZone);

export {DropZone as default};