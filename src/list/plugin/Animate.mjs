import Base from '../../plugin/Base.mjs';

/**
 * @class Neo.list.plugin.Animate
 * @extends Neo.plugin.Base
 */
class Animate extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.plugin.Animate'
         * @protected
         */
        className: 'Neo.list.plugin.Animate'
    }}

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        console.log('Neo.list.plugin.Animate ctor');
    }
}

Neo.applyClassConfig(Animate);

export {Animate as default};
