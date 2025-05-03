import Label         from '../../../src/component/Label.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import TextField     from '../../../src/form/field/Text.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.stateProvider.twoWay.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.twoWay.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.twoWay.MainContainer',
        /**
         * @member {Object|Neo.state.Provider} stateProvider
         */
        stateProvider: {
            data: {
                user: {
                    details: {
                        firstname: 'Tobias',
                        lastname : 'Uhlig'
                    }
                }
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module    : Label,
            flex      : 'none',
            labelText : 'Firstname',
            labelWidth: 110,
            width     : 300,

            bind: {
                text: data => data.user.details.firstname + ' ' + data.user.details.lastname
            },
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Firstname',
            labelWidth: 110,
            style     : {marginTop: '2em'},
            width     : 300,

            bind: {
                value: {twoWay: true, value: data => data.user.details.firstname}
            },
        }, {
            module    : TextField,
            flex      : 'none',
            labelText : 'Lastname',
            labelWidth: 110,
            width     : 300,

            bind: {
                value: {twoWay: true, value: data => data.user.details.lastname}
            },
        }],
        /**
         * @member {Object} style
         */
        style: {
            padding: '5em'
        }
    }
}

export default Neo.setupClass(MainContainer);
