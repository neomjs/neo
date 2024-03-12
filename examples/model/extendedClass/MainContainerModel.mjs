import Component from '../../../src/model/Component.mjs';

/**
 * @class Neo.examples.model.extendedClass.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.extendedClass.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.model.extendedClass.MainContainerModel',
        /**
         * @member {Object} data
         */
        data: {
            button1Text: 'Button 1',
            button2Text: 'Button 2'
        }
    }
}

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
