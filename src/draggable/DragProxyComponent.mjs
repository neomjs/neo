import Base from '../component/Base.mjs';

/**
 * @class Neo.draggable.DragProxyComponent
 * @extends Neo.component.Base
 */
class DragProxyComponent extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.DragProxyComponent'
         * @protected
         */
        className: 'Neo.draggable.DragProxyComponent',
        /**
         * @member {String} ntype='dragproxy'
         * @protected
         */
        ntype: 'dragproxy',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Boolean} autoRender=true
         */
        autoRender: true,
        /**
         * @member {String[]} cls=['neo-dragproxy']
         */
        cls: ['neo-dragproxy'],
        /**
         * @member {String} parentId='document.body'
         */
        parentId: 'document.body'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.on('mounted', me.onMounted, me);
    }

    /**
     *
     * @param {String} id
     */
    onMounted(id) {
        Neo.main.addon.DragDrop.setDragProxyId({
            id: id
        });
    }
}

Neo.applyClassConfig(DragProxyComponent);

export {DragProxyComponent as default};