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
                'We are doing weekly workshops on Thursdays 17:30 CEST for 60m free of charge.</br>',
                'Ping us inside our Slack Channel, in case you would like to join us.'
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
                {tag: 'li', html: 'While remote is possible, we strongly recommend On-Site Trainings.'},
            ]}
        ]}
    }
}

Neo.setupClass(Component);

export default Component;
