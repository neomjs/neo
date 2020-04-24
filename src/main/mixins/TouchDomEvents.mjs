import Base from '../../core/Base.mjs';

/**
 * Will get imported in case Neo.config.useTouchEvents === true
 * @class Neo.main.mixins.TouchDomEvents
 * @extends Neo.core.Base
 * @singleton
 */
class TouchDomEvents extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.mixins.TouchDomEvents'
             * @private
             */
            className: 'Neo.main.mixins.TouchDomEvents'
        }
    }
}

Neo.applyClassConfig(TouchDomEvents);

export {TouchDomEvents as default};