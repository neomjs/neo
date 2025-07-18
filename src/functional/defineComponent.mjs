import FunctionalBase from './component/Base.mjs';

/**
 * Factory function to create a functional component class from a specification object.
 * This enables a "Beginner Mode" for creating components without writing a class,
 * while still providing access to the full class-based feature set.
 *
 * It's important to understand the two ways of managing state:
 *
 * 1.  **Named Configs (Public API):** Defined in the `config` object (e.g., `text_`).
 *     - **Purpose:** Defines the component's public API for external control, similar to props.
 *     - **Use Case:** For data that a parent component will set or change.
 *     - **Features:** Integrates with the full config system (e.g., `afterSetText()` hooks).
 *
 * 2.  **`useConfig()` (Internal State):** Used inside `createVdom` or other methods.
 *     - **Purpose:** Manages private, encapsulated state that is internal to the component.
 *     - **Use Case:** For state that the component manages itself and is not controlled by the parent.
 *     - **Features:** Provides a simple, concise way to handle local reactive state.
 *
 * @param {Object} spec - The specification object for the component.
 * @returns {Neo.functional.component.Base} The generated component class.
 *
 * @example
 * import { defineComponent } from 'neo/functional/defineComponent.mjs';
 * import { useConfig }       from 'neo/functional/useConfig.mjs';
 *
 * const MyComponent = defineComponent({
 *     // 1. Define the Public API via the `config` object.
 *     config: {
 *         className: 'MyApp.MyFunctionalComponent',
 *         ntype    : 'my-functional-component',
 *
 *         // `text_` is a NAMED CONFIG. It's part of the component's public API.
 *         // A parent can create this component with a `text` config.
 *         // It is reactive and will generate `afterSetText()` and `beforeSetText()` hooks.
 *         text_: 'Hello World'
 *     },
 *
 *     // 2. Define the component's logic and VDOM.
 *     createVdom(config) {
 *         // `useConfig` creates ANONYMOUS, INTERNAL STATE.
 *         // The `count` state is private to this component and cannot be set by a parent.
 *         const [count, setCount] = useConfig(0);
 *
 *         return {
 *             tag: 'div',
 *             cn: [{
 *                 tag: 'h1',
 *                 // Access the public, named config via the `config` parameter.
 *                 text: config.text
 *             }, {
 *                 tag: 'p',
 *                 // Access the private, internal state directly.
 *                 text: `You clicked ${count} times`
 *             }, {
 *                 tag: 'button',
 *                 text: 'Click me',
 *                 // The setter from `useConfig` updates the internal state.
 *                 onclick: () => setCount(count + 1)
 *             }]
 *         };
 *     },
 *
 *     // 3. Lifecycle hooks for named configs work automatically.
 *     afterSetText(newValue, oldValue) {
 *         console.log(`Text changed from '${oldValue}' to '${newValue}'`);
 *     }
 * });
 *
 * // The returned MyComponent is a class constructor that can be used with Neo.create()
 * // const instance = Neo.create(MyComponent, {
 * //     text: 'Welcome to Neo.mjs!' // Set the public config on creation.
 * // });
 */
export function defineComponent(spec) {
    const configSpec = spec.config;
    delete spec.config;

    if (!configSpec?.className) {
        throw new Error('defineComponent requires a config object with a className.');
    }

    class FunctionalComponent extends FunctionalBase {
        static config = {
            ...configSpec
            // We can add our own configurations here
        }
    }

    // Assign instance methods
    Object.entries(spec).forEach(([key, value]) => {
        FunctionalComponent.prototype[key] = value
    });

    // To support multiple envs (like `devmode`, `dist/esm`, `dist/production` in parallel,
    // we must re-assign FunctionalComponent to the setupClass() output.
    FunctionalComponent = Neo.setupClass(FunctionalComponent);

    return FunctionalComponent
}

export default defineComponent;
