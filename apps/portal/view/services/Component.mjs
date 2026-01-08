import BaseComponent from '../../../../src/component/Base.mjs';

/**
 * @class Portal.view.services.Component
 * @extends Neo.component.Base
 */
class Component extends BaseComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.services.Component'
         * @protected
         */
        className: 'Portal.view.services.Component',
        /**
         * @member {String[]} cls=['portal-services-component', 'portal-shared-background']
         * @reactive
         */
        cls: ['portal-services-component', 'portal-shared-background'],
        /**
         * @member {Object} vdom
         */
        vdom:
        {cn: [
            {tag: 'h1', cls: ['neo-h1'], text: 'Services'},
            {cls: ['portal-content-box'], cn: [
                {tag: 'h2', cls: ['portal-content-box-headline'], text: 'Professional Trainings'},
                {cls: ['portal-content-box-content'], cn: [
                    {tag: 'p',  text: [
                        'While we do have a self-study based Learning Section online, you can also hire us ',
                        'in case you prefer an Instructor-led Training for bringing your team up to speed.'
                    ].join('')},
                    {tag: 'ul', cn: [
                        {tag: 'li', text: 'One week packed with 40h of intense training.'},
                        {tag: 'li', text: 'Including hands-on Labs'},
                        {tag: 'li', text: '6 - 12 attendees'},
                        {tag: 'li', text: 'While Remote Trainings are possible, we strongly recommend On-Site Trainings instead.'},
                    ]},
                    {tag: 'p',  html: [
                        'Feel free to send us an <a href="mailto:trainings@neomjs.com">Email</a> to plan your training timeframe.',
                    ].join('')}
                ]}
            ]},
            {cls: ['portal-content-box'], cn: [
                {tag: 'h2', cls: ['portal-content-box-headline'], text: 'Professional Services'},
                {cls: ['portal-content-box-content'], cn: [
                    {tag: 'p',  text: [
                        'We can help you to ensure your Neo.mjs based projects run successfully.',
                    ].join('')},
                    {tag: 'ul', cn: [
                        {tag: 'li', text: 'Feasibility Analysis: Is Neo.mjs a good fit for your project needs?'},
                        {tag: 'li', text: 'Creating a Neo.mjs PoC which matches your specific needs'},
                        {tag: 'li', text: 'Code Reviews'},
                        {tag: 'li', text: 'Frontend-Architecture Guidance'},
                        {tag: 'li', text: 'Application & Framework Debugging'},
                        {tag: 'li', text: 'Creation of Custom Components, Design Themes & new Features'},
                        {tag: 'li', text: 'Hands-On Application Development Support'}
                    ]},
                    {tag: 'p',  html: [
                        'In case you need help, send us an <a href="mailto:services@neomjs.com">Email</a>.',
                    ].join('')}
                ]}
            ]}
        ]}
    }
}

export default Neo.setupClass(Component);
