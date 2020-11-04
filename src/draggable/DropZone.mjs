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
        ntype: 'dropzone'
    }}
}

Neo.applyClassConfig(DropZone);

export {DropZone as default};