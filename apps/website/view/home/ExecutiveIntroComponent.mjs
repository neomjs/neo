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
        vdom: {innerHTML: [
            '<h1>Content</h1>',
            '<ol>',
                '<li>Introduction</li>',
                '<li>Sponsorship</li>',
                '<li>The planned Business Model (BaaS)</li>',
                '<li>You can influence the neo.mjs roadmap</li>',
                '<li>Do you need help creating a prototype App for your use case?</li>',
                '<li>How to get in touch?</li>',
            '</ol>',
            '<h1>1. Introduction</h1>',
            '<p>',
                'neo.mjs is the next generation UI framework for creating desktop & mobile Web Apps. ',
                'It has a very strong focus on performance and creating scalable & modular architectures. ',
                'A clean & consistent API, as well as the ability to run without any build processes, ',
                'will increase the productivity of your team, while creating better solutions at the same time.',
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
                'a lot faster. Your company logo & link will get added to different places depending on the tier level, ',
                'which will increase your reputation inside the neo.mjs developer community.',
            '</p>',
            '<h1>3. The planned Business Model (BaaS)</h1>',
            '<p>',
                'Business as a Service means to provide you with additional help, if needed.',
                '<ol>',
                    '<li>',
                        '<b>Trainings</b></br>',
                        'While you can learn using neo.mjs with following the publicly available tutorials, ',
                        'it can be a nicer and more productive learning experience to get an onsite training. ',
                        '6 - 15 attendees, 1 week (5 * 8 hours). ',
                        'I have moderated several UI framework related trainings in the past, ',
                        'so I have a very good idea on how it should work.',
                    '</li>',
                    '<li>',
                        '<b>Professional Services</b></br>',
                        'In case you need help with your App development, code reviews or even new framework components, ',
                        'themes or features which do not exist yet, the PS team will be there for you. ',
                        'Remote help is available for €150/h, onsite help for €200/h (plus travel & lodging costs). ',
                        'VAT (if applicable) is not included.',
                    '</li>',
                    '<li>',
                        '<b>Support</b></br>',
                        'In case you need a guaranteed response time for your questions & tickets, there will be support ',
                        'packages to ensure this. The exact details are not figured out yet.',
                    '</li>',
                '</ol>',
                'In case the BaaS options are interesting for you, you are welcome to reach out to me.',
            '</p>',
        ].join('')}
    }}
}

Neo.applyClassConfig(ExecutiveIntroComponent);

export {ExecutiveIntroComponent as default};