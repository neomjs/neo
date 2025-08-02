import {defineComponent, html, useConfig, useEvent} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        /**
         * @member {String} className='Neo.examples.functional.templateComponent.Component'
         */
        className: 'Neo.examples.functional.templateComponent.Component',
        /**
         * This is the key to unlock the `Template literals` based syntax for VDOM.
         * @member {Boolean} enableHtmlTemplates=true
         * @reactive
         */
        enableHtmlTemplates: true,
        /**
         * @member {String} greeting_='Hello'
         * @reactive
         */
        greeting_: 'Hello',
        /**
         * @member {String} jobTitle_='Neo.mjs Developer'
         * @reactive
         */
        jobTitle_: 'Neo.mjs Developer'
    },

    render(config) {
        const [isActive, setIsActive] = useConfig(true);

        useEvent('click', () => setIsActive(prev => !prev));

        const cardStyle = {
            border    : '1px solid #eee',
            borderRadius: '8px',
            padding   : '16px',
            textAlign : 'center',
            cursor    : 'pointer',
            boxShadow : '0 2px 4px rgba(0,0,0,0.1)'
        };

        const statusStyle = {
            display      : 'inline-block',
            padding      : '4px 8px',
            borderRadius : '12px',
            color        : 'white',
            backgroundColor: isActive ? '#28a745' : '#dc3545',
            fontSize     : '12px',
            marginTop    : '10px'
        };

        return html`
            <div style="${cardStyle}">
                <h2>${config.greeting}, Neo!</h2>
                <p>${config.jobTitle}</p>
                <div style="${statusStyle}">
                    ${isActive ? 'Active' : 'Inactive'}
                </div>
            </div>
        `
    }
});
