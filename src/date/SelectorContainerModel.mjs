import Component from '../model/Component.mjs';

/**
 * @class Neo.date.SelectorContainerModel
 * @extends Neo.model.Component
 */
class SelectorContainerModel extends Component {
    static config = {
        /**
         * @member {String} className='Neo.date.SelectorContainerModel'
         * @protected
         */
        className: 'Neo.date.SelectorContainerModel',
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

export default Neo.setupClass(SelectorContainerModel);
