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
         * @member {String[]} cls=['portal-services-component']
         */
        cls: ['portal-services-component'],
        /**
         * @member {Object} vdom
         */
        vdom:
        {cn: [
            {tag: 'h1', html: 'Services'},
            {tag: 'h2', html: 'Weekly Workshops'},
            {tag: 'p',  html: [
                'We are doing weekly workshops on Thursdays 17:30 CEST (11:30am EST) for 60m free of charge.</br>',
                'Ping us inside our ',
                '<a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA">Slack Channel</a>, ',
                'in case you would like to join us.'
            ].join('')},
            {tag: 'h2', html: 'Professional Trainings'},
            {tag: 'p',  html: [
                'While we do have a self-study based Learning Section online, you can also hire us ',
                'in case you prefer an Instructor-led Training for bringing your team up to speed.'
            ].join('')},
            {tag: 'ul', cn: [
                {tag: 'li', html: 'One week packed with 40h of intense training.'},
                {tag: 'li', html: 'Including hands-on Labs'},
                {tag: 'li', html: '6 - 12 attendees'},
                {tag: 'li', html: 'While Remote Trainings are possible, we strongly recommend On-Site Trainings instead.'},
            ]},
            {tag: 'p',  html: [
                'Feel free to send us an <a href="mailto:trainings@neomjs.com">Email</a> to plan your training timeframe.',
            ].join('')},
            {tag: 'h2', html: 'Professional Services'},
            {tag: 'p',  html: [
                'We can help you to ensure your Neo.mjs based projects run successfully.',
            ].join('')},
            {tag: 'ul', cn: [
                {tag: 'li', html: 'Feasibility Analysis: Is Neo.mjs a good fit for your project needs?'},
                {tag: 'li', html: 'Creating a Neo.mjs PoC which matches your specific needs'},
                {tag: 'li', html: 'Code Reviews'},
                {tag: 'li', html: 'Frontend-Architecture Guidance'},
                {tag: 'li', html: 'Application & Framework Debugging'},
                {tag: 'li', html: 'Creation of Custom Components & new Features'},
                {tag: 'li', html: 'Creation of Custom Design Themes'},
                {tag: 'li', html: 'Hands-On Application Development Support'}
            ]},
            {tag: 'p',  html: [
                'In case you need help, send us an <a href="mailto:services@neomjs.com">Email</a>.',
            ].join('')}
        ]}
    }
}

Neo.setupClass(Component);

export default Component;
