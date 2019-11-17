import Base from '../core/Base.mjs';

/**
 * Mixin to make Components floating (e.g. Windows)
 * @class Neo.util.Floating
 * @extends Neo.core.Base
 */
class Floating extends Base {
    static getConfig() {return {
        className      : 'Neo.util.Floating',
        ntype          : 'mixin-floating',
        mixin          : true,
        animateTargetId: null,
        modal_         : false
    }}
}

Neo.applyClassConfig(Floating);

export default Floating;