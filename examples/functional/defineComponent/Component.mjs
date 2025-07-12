import defineComponent from '../../../src/functional/defineComponent.mjs';
import useConfig       from '../../../src/functional/useConfig.mjs';

export default defineComponent({
    config: {
        className: 'Neo.examples.functional.defineComponent.Component',
        greeting_: 'Hello'
    },
    createVdom(config) {
        const [name, setName] = useConfig('World');

        return {
            tag : 'div',
            text: `${config.greeting}, ${name}!`
        }
    }
});
