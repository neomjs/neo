import Model from '../../../src/state/Provider.mjs';

/**
 * @class Neo.examples.stateProvider.extendedClass.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.extendedClass.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.examples.stateProvider.extendedClass.MainContainerStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            button1Text: 'Button 1',
            button2Text: 'Button 2'
        }
    }
}

export default Neo.setupClass(MainContainerStateProvider);
