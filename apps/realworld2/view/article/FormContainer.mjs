import ChipField from '../../../../src/form/field/Chip.mjs';
import Container from '../../../../src/form/Container.mjs';
import TextArea  from '../../../../src/form/field/TextArea.mjs';
import Toolbar   from '../../../../src/container/Toolbar.mjs';
import TextField from '../../../../src/form/field/Text.mjs';

/**
 * @class RealWorld2.view.article.FormContainer
 * @extends Neo.form.Container
 */
class FormContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.FormContainer'
         * @protected
         */
        className: 'RealWorld2.view.article.FormContainer',
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
            labelText    : 'Article Title',
            name         : 'title'
        }, {
            module       : TextField,
            labelPosition: 'inline',
            labelText    : 'What\'s this article about?',
            name         : 'description'
        }, {
            module       : TextArea,
            labelPosition: 'inline',
            labelText    : 'Write your article (in markdown)',
            name         : 'body'
        }, {
            module       : TextField, // todo: ChipField
            labelPosition: 'inline',
            labelText    : 'Enter Tags',
            name         : 'tags'
        }, {
            module: Toolbar,
            items : ['->', {
                text: 'Publish Article'
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

Neo.applyClassConfig(FormContainer);

export {FormContainer as default};