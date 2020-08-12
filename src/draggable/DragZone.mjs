import Base                  from '../core/Base.mjs';
import DragProxyComponent    from './DragProxyComponent.mjs';
import {default as VDomUtil} from '../util/VDom.mjs';

/**
 * @class Neo.draggable.DragZone
 * @extends Neo.core.Base
 */
class DragZone extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.DragZone'
         * @protected
         */
        className: 'Neo.draggable.DragZone',
        /**
         * @member {String} ntype='dragzone'
         * @protected
         */
        ntype: 'dragzone',
        /**
         * The vdom (tree) of the element you want to drag
         * @member {Object|null} dragElement=null
         */
        dragElement: null,
        /**
         * @member {Neo.component.Base|null} dragProxy=null
         */
        dragProxy: null
    }}

    /**
     *
     */
    dragEnd() {
        console.log('dragEnd');
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     */
    dragMove(data) {
        console.log('dragMove', data);
    }

    /**
     *
     */
    dragStart() {
        let me    = this,
            clone = VDomUtil.clone(me.dragElement);

        me.dragProxy = Neo.create({
            module: DragProxyComponent,
            vdom  : {
                cn: [clone]
            }
        });

        console.log(me.dragProxy);
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};