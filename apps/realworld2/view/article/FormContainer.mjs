import Container              from '../../../../src/form/Container.mjs';
import {default as TextField} from '../../../../src/form/field/Text.mjs';

/**
 * @class RealWorld2.view.article.FormContainer
 * @extends Neo.form.Container
 */
class FormContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.FormContainer'
         * @private
         */
        className: 'RealWorld2.view.article.FormContainer',
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
            labelText    : 'What\'s this article about?' ,
            name         : 'description'
        }],
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'base'}
    }}
}

Neo.applyClassConfig(FormContainer);

export {FormContainer as default};