import Model from '../../../src/model/Component.mjs';

/**
 * @class Neo.examples.stateProvider.extendedClass.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.extendedClass.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.stateProvider.extendedClass.MainContainerModel',
        /**
         * @member {Object} data
         */
        data: {
            button1Text: 'Button 1',
            button2Text: 'Button 2'
        }
    }
}

export default Neo.setupClass(MainContainerModel);
