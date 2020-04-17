import {default as BaseContainer} from '../../../../src/container/Base.mjs';

/**
 * @class Covid.view.mapboxGl.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.mapboxGl.Container'
         * @private
         */
        className: 'Covid.view.mapboxGl.Container'
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};