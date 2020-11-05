import Base from '../core/Base.mjs';

/**
 * @class Neo.draggable.DropZone
 * @extends Neo.core.Base
 */
class DropZone extends Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

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
     * @param {Object} data
     */
    onDrop(data) {
        console.log('onDrop', this.id);
    }

    /**
     *
     * @param {Object} data
     */
    onDropEnter(data) {
        console.log('onDropEnter', this.id);
    }

    /**
     *
     * @param {Object} data
     */
    onDropLeave(data) {
        console.log('onDropLeave', this.id);
    }
}

Neo.applyClassConfig(DropZone);

export {DropZone as default};