import Container              from '../../../../src/form/Container.mjs';
import Toolbar                from '../../../../src/container/Toolbar.mjs';
import {default as TextField} from '../../../../src/form/field/Text.mjs';

/**
 * @class RealWorld2.view.user.SettingsFormContainer
 * @extends Neo.form.Container
 */
class SettingsFormContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.user.SettingsFormContainer'
         * @protected
         */
        className: 'RealWorld2.view.user.SettingsFormContainer',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            style: {
                maxWidth: '500px'
            }
        },
        /**
         * @member {Array} items
         */
        items: [{
            module       : TextField,
            labelPosition: 'inline',
            labelText    : 'URL of profile picture',
            name         : 'image'
        }, {
            module       : TextField,
            labelPosition: 'inline',
            labelText    : 'Your Name',
            name         : 'name'
        }, {
            module: Toolbar,
            items : ['->', {
                text: 'Submit'
            }],
            style: {
                maxWidth: '500px',
                padding : 0
            }
        }],
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'base'}
    }}
}

Neo.applyClassConfig(SettingsFormContainer);

export {SettingsFormContainer as default};