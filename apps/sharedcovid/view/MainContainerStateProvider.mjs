import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class SharedCovid.view.MainContainerStateProvider
 * @extends Neo.model.Component
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.MainContainerStateProvider'
         * @protected
         */
        className: 'SharedCovid.view.MainContainerStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {String|null} data.country=null
             */
            country: null,
            /**
             * We are storing the currently selected record of the SharedCovid.view.HeaderContainer SelectField
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

export default Neo.setupClass(MainContainerStateProvider);
