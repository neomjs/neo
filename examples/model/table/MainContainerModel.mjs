import Component from '../../../src/model/Component.mjs';

/**
 * @class Neo.examples.model.table.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.table.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.model.table.MainContainerModel'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        console.log('Neo.examples.model.table.MainContainerModel ctor');
    }
}

Neo.applyClassConfig(MainContainerModel);

export {MainContainerModel as default};