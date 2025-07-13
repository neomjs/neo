import {defineComponent, useConfig, useEvent} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className: 'Neo.examples.functional.defineComponent.Component',
        greeting_: 'Hello'
    },
    createVdom(config) {
        const [name, setName] = useConfig('World');

        useEvent('click', () => setName(name === 'Neo' ? 'World' : 'Neo'));

        return {
            tag : 'div',
            text: `${config.greeting}, ${name}!`
        }
    }
});
