import {default as Component}   from '../../../src/component/Base.mjs';

/**
 * @class Covid.view.AttributionComponent
 * @extends Neo.component.Base
 */
class AttributionComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.AttributionComponent'
         * @private
         */
        className: 'Covid.view.AttributionComponent',
        /**
         * @member {String} html
         */
        html: 'todo'
    }}
}

Neo.applyClassConfig(AttributionComponent);

export {AttributionComponent as default};