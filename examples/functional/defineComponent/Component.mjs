import {defineComponent, useConfig, useEvent} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className: 'Neo.examples.functional.defineComponent.Component',
        greeting_: 'Hello'
    },
    createVdom(config) {
        const [name, setName] = useConfig('World');

        useEvent('click', () => setName(prev => prev === 'Neo' ? 'World' : 'Neo'));

        return {
        //  tag : 'div', // div is the default value
            text: `${config.greeting}, ${name}!`
        }
    }
});
