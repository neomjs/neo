import Button from '../../../src/button/Base.mjs';
import {defineComponent, html, useConfig, useEvent} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        /**
         * @member {String} className='Neo.examples.functional.nestedTemplateComponent.Component'
         */
        className: 'Neo.examples.functional.nestedTemplateComponent.Component',
        /**
         * @member {String} detailsText_='Here are some more details!'
         * @reactive
         */
        detailsText_: 'Here are some more details!',
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
        const [showDetails, setShowDetails] = useConfig(false);

        // This event listener is for the main container to toggle the active state
        useEvent('click', (event) => {
            // Stop the event from bubbling up to avoid toggling the active state
            // when the button is clicked. The button has its own handler.
            if (event.target.id === 'details-button') {
                event.stopPropagation();
            } else {
                setIsActive(prev => !prev);
            }
        });

        // The idiomatic way to handle a button click is with the handler config.
        const onButtonClick = () => {
            setShowDetails(prev => !prev);
        };

        const cardStyle = {
            border      : '1px solid #eee',
            borderRadius: '8px',
            boxShadow   : '0 2px 4px rgba(0,0,0,0.1)',
            cursor      : 'pointer',
            padding     : '16px',
            textAlign   : 'center'
        };

        const statusStyle = {
            backgroundColor: isActive ? '#28a745' : '#dc3545',
            borderRadius   : '12px',
            color          : 'white',
            display        : 'inline-block',
            fontSize       : '12px',
            marginTop      : '10px',
            padding        : '4px 8px'
        };

        // 1. Nested Template: A separate template for the details section
        const detailsTemplate = html`
            <div style="margin-top: 15px; padding: 10px; border-top: 1px solid #eee;">
                <p>${config.detailsText}</p>
            </div>
        `;

        return html`
            <div style=${cardStyle}>
                <h2>${config.greeting}, Neo!</h2>
                <p>${config.jobTitle}</p>

                <!-- 3. Component via Tag Name, using the idiomatic handler config -->
                <${Button}
                    handler=${onButtonClick}
                    id="details-button"
                    text="${showDetails ? 'Hide' : 'Show'} Details"
                />

                <!-- 2. Conditional Rendering: Using a boolean to show the nested template -->
                ${showDetails && detailsTemplate}

                <div style="${statusStyle}">
                    ${isActive ? 'Active' : 'Inactive'}
                </div>
            </div>
        `
    }
});
