import StateProvider from '../state/Provider.mjs';

/**
 * @class Neo.date.SelectorContainerStateProvider
 * @extends Neo.state.Provider
 */
class SelectorContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.date.SelectorContainerStateProvider'
         * @protected
         */
        className: 'Neo.date.SelectorContainerStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {Intl.DateTimeFormat|null} data.intlFormatDay=null
             */
            intlFormatDay: null,
            /**
             * 0-6 => Sun-Sat
             * @member {Number} data.weekStartDay=0
             */
            weekStartDay: 0
        }
    }
}

export default Neo.setupClass(SelectorContainerStateProvider);
