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
                '<h1>1. Introduction</h1>',
                '<p>',
                    'neo.mjs is the next generation UI framework for creating desktop & mobile Web Apps. ',
                    'It has a very strong focus on performance and creating scalable & modular architectures. ',
                    'A clean & consistent API, as well as the ability to run without any build processes, ',
                    'will increase the development speed of your team, while creating better solutions at the same time.',
                '</p>',
                '<h1>2. Sponsorship</h1>',
                '<p>',
                    'The entire neo.mjs ecosystem, including all examples & Demo Apps is open sourced (MIT licensed). ',
                    'You can use it for free. However, creating a framework of this complexity is taking a massive amount ',
                    'of time and effort on my end and will continue to do so.',
                '</p>',
                '<p>',
                    'Please ask yourself the following 2 questions:',
                '</p>',
                '<ol>',
                    '<li>Does neo.mjs create business value for your company?</li>',
                    '<li>Will it create business value for your company in the future?</li>',
                '</ol>',
                '<p>',
                'In case the answer for at least one of them is "Yes", please consider supporting the project as a sponsor:',
                '</p>',
                '<p>',
                    '<a target="_blank" href="https://github.com/sponsors/tobiu">Sign up as a sponsor</a>',
                '</p>',
                '<p>',
                    'This will enable me to spend more time on neo.mjs, so you will get new widgets, features and bugfixes ',
                    'a lot faster.',
                '</p>',
            ].join('')
        }
    }}
}

Neo.applyClassConfig(ExecutiveIntroComponent);

export {ExecutiveIntroComponent as default};