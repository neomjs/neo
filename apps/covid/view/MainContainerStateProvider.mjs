import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class Covid.view.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerModel extends StateProvider {
    static config = {
        /**
         * @member {String} className='Covid.view.MainContainerStateProvider'
         * @protected
         */
        className: 'Covid.view.MainContainerStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {String|null} data.country=null
             */
            country: null,
            /**
             * We are storing the currently selected record of the Covid.view.HeaderContainer SelectField
             * @member {Object} data.countryRecord=null
             */
            countryRecord: null
        }
    }

    /**
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        if (oldValue !== undefined) {
            if (key === 'country') {
                Neo.Main.editRoute({
                    country: value
                });
            }
        }
    }
}

export default Neo.setupClass(MainContainerModel);
