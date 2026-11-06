import Container        from '../../../src/container/Base.mjs';
import CounterComponent from './CounterComponent.mjs';

/**
 * @summary Forwards parent-controlled configs to one classic-owned functional child.
 * @class Neo.examples.functional.nestedComponents.RelayContainer
 * @extends Neo.container.Base
 */
class RelayContainer extends Container {
    static config = {
        className: 'Neo.examples.functional.nestedComponents.RelayContainer',
        /**
         * @member {String} message_=''
         * @reactive
         */
        message_: '',
        /**
         * @member {Number} value_=0
         * @reactive
         */
        value_: 0,
        items : [{
            module : CounterComponent,
            heading: '3 · Functional child through the classic container'
        }]
    }

    /** @summary Forwards later parent message updates after construction has created the child. */
    afterSetMessage() {this.isConstructed && this.syncChild()}

    /** @summary Forwards later parent value updates to the same child instance. */
    afterSetValue() {this.isConstructed && this.syncChild()}

    /** @summary Applies initial configs after the inherited container creates its owned items. */
    onConstructed() {
        super.onConstructed();
        this.syncChild()
    }

    /** @summary Updates named configs in place; rebuilding items would discard the child's local counter. */
    syncChild() {
        this.items[0].set({message: this.message, value: this.value})
    }
}

export default Neo.setupClass(RelayContainer);
