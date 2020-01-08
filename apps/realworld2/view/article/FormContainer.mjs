import Container from '../../../../src/form/Container.mjs';

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
        className: 'RealWorld2.view.article.FormContainer'
    }}
}

Neo.applyClassConfig(FormContainer);

export {FormContainer as default};