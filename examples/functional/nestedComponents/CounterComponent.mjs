import {defineComponent, useConfig} from '../../../src/functional/_export.mjs';
import Button                       from '../../../src/button/Base.mjs';

/**
 * @summary Combines parent-controlled configs with an independent, private local counter.
 * @class Neo.examples.functional.nestedComponents.CounterComponent
 * @extends Neo.functional.component.Base
 */
export default defineComponent({
    config: {
        className: 'Neo.examples.functional.nestedComponents.CounterComponent',
        /** @member {String} heading='Functional child' */
        heading: 'Functional child',
        /**
         * @member {String} message_=''
         * @reactive
         */
        message_: '',
        /**
         * @member {Number} value_=0
         * @reactive
         */
        value_: 0
    },

    /**
     * @summary Parent config updates rerender this leaf without resetting its local hook state.
     * @param {Neo.functional.component.Base} config
     * @returns {Object}
     */
    createVdom(config) {
        const [count, setCount] = useConfig(0);

        return {cn: [
            {tag: 'h3', text: config.heading},
            {tag: 'p', cls: ['child-value'], text: `Value: ${config.value}`},
            {tag: 'p', cls: ['child-message'], text: `Message: ${config.message}`},
            {
                module : Button,
                id     : config.id + '__increment',
                text   : `Local clicks: ${count}`,
                handler: () => setCount(previous => previous + 1)
            }
        ]}
    }
});
