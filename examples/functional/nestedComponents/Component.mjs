import {defineComponent} from '../../../src/functional/_export.mjs';
import CounterComponent  from './CounterComponent.mjs';
import RelayContainer    from './RelayContainer.mjs';

/**
 * @summary Passes named configs to two retained children, one through a classic container.
 * @class Neo.examples.functional.nestedComponents.Component
 * @extends Neo.functional.component.Base
 */
export default defineComponent({
    config: {
        className: 'Neo.examples.functional.nestedComponents.Component',
        /**
         * @member {String} message_='Hello from the root'
         * @reactive
         */
        message_: 'Hello from the root',
        /**
         * @member {Number} value_=1
         * @reactive
         */
        value_: 1
    },

    /**
     * @summary Fresh descriptors update existing children because their owner-derived IDs stay stable.
     * @param {Neo.functional.component.Base} config
     * @returns {Object}
     */
    createVdom(config) {
        const {id, message, value} = config;

        return {cn: [
            {tag: 'h1', text: 'Deeply nested components'},
            {tag: 'p', text: 'Change the root values in Configuration, then apply them. Each child keeps its own click count.'},
            {tag: 'h2', text: '1 · Functional root'},
            {tag: 'p', cls: ['root-values'], text: `Value: ${value} · Message: ${message}`},
            {tag: 'h2', text: '2 · Classic container'},
            {module: RelayContainer, id: id + '__relay', message, value},
            {module: CounterComponent, id: id + '__direct', heading: '2 · Direct functional child', message, value}
        ]}
    }
});
