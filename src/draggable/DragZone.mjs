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
         * The name of the App this instance belongs to
         * @member {String|null} appName=null
         */
        appName: null,
        /**
         * The vdom (tree) of the element you want to drag
         * @member {Object|null} dragElement=null
         */
        dragElement: null,
        /**
         * @member {Neo.component.Base|null} dragProxy=null
         */
        dragProxy: null,
        /**
         * @member {Object|null} dragProxyConfig=null
         */
        dragProxyConfig: null
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
        let me = this,
            style;

        if (me.dragProxy) {
            style = me.dragProxy.style;

            style.left = `${data.clientX}px`;
            style.top  = `${data.clientY}px`;

            me.dragProxy.style = style;
        }
    }

    /**
     *
     */
    dragStart() {
        let me    = this,
            clone = VDomUtil.clone(me.dragElement);

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.dragElement.id
        }).then(data => {
            me.dragProxy = Neo.create({
                module : DragProxyComponent,
                appName: me.appName,
                vdom   : {cn: [clone]},

                style: {
                    height: `${data.height}px`,
                    left  : `${data.left}px`,
                    top   : `${data.top}px`,
                    width : `${data.width}px`
                },

                ...me.dragProxyConfig || {}
            });

            console.log(me.dragProxy);
        });
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};