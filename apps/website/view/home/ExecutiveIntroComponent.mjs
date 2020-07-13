import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Website.view.home.ExecutiveIntroComponent
 * @extends Neo.component.Base
 */
class ExecutiveIntroComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.home.ExecutiveIntroComponent'
         * @protected
         */
        className: 'Website.view.home.ExecutiveIntroComponent',
        /**
         * @member {String[]} cls=['website-intro-component']
         * @protected
         */
        cls: ['website-intro-component'],
        /**
         * @member {Object} vdom
         */
        vdom: {
            innerHTML: [
                '<h1>Content</h1>',
                '<ol>',
                    '<li>Introduction</li>',
                    '<li>Sponsorship</li>',
                    '<li>The planned Business Model (BaaS)</li>',
                    '<li>Do you need help creating a prototype App for your use case?</li>',
                '</ol>',
                '<h1>Introduction</h1>',
                '<p>A nice intro text</p>',
                '<h1>Sponsorship</h1>'
            ].join('')
        }
    }}
}

Neo.applyClassConfig(ExecutiveIntroComponent);

export {ExecutiveIntroComponent as default};