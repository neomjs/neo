import Base from '../core/Base.mjs';

/**
 * Mixin to make Components floating (e.g. Windows)
 * @class Neo.util.Floating
 * @extends Neo.core.Base
 */
class Floating extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.util.Floating'
         * @private
         */
        className: 'Neo.util.Floating',
        /**
         * @member {String} ntype='mixin-floating'
         * @private
         */
        ntype: 'mixin-floating',
        /**
         * @member {Boolean} mixin=true
         */
        mixin: true,
        /**
         * @member {String|null} animateTargetId=null
         */
        animateTargetId: null,
        /**
         * @member {Boolean} modal_=false
         */
        modal_: false
    }}
}

Neo.applyClassConfig(Floating);

export default Floating;