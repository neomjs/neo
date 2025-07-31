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
        greeting_: 'Hello'
    },

    createTemplateVdom(config) {
        const [name, setName] = useConfig('World');

        useEvent('click', () => setName(prev => prev === 'Neo' ? 'World' : 'Neo'));

        return html`
            <div>${config.greeting}, ${name}</div>
        `
    }
});
