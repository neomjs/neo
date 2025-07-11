import FunctionalBase from './component/Base.mjs';

/**
 * Factory function to create a functional component class from a specification object.
 * This enables a "Beginner Mode" for creating components without writing a class,
 * while still providing access to the full class-based feature set like static configs
 * and lifecycle methods.
 * @param {Object} spec - The specification object for the component.
 * @returns {Neo.functional.component.Base} The generated component class.
 *
 * @example
 * import { defineComponent } from 'neo/functional/defineComponent.mjs';
 * import { useConfig }       from 'neo/functional/useConfig.mjs';
 *
 * const MyComponent = defineComponent({
 *     // 1. Static properties are defined first for a clear mental model.
 *     // This object is directly used as the class's `static config`.
 *     static: {
 *         className: 'MyApp.MyFunctionalComponent',
 *         ntype    : 'my-functional-component',
 *
 *         // Reactive configs have a trailing underscore.
 *         // This will generate afterSetText() and beforeSetText() hooks.
 *         text_: 'Hello World'
 *     },
 *
 *     // 2. Methods (instance logic) follow the static definition.
 *     createVdom(config) {
 *         const [count, setCount] = useConfig(0);
 *
 *         return {
 *             tag: 'div',
 *             cn: [{
 *                 tag: 'h1',
 *                 text: config.text // Access reactive configs without the underscore.
 *             }, {
 *                 tag: 'p',
 *                 text: `You clicked ${count} times`
 *             }, {
 *                 tag: 'button',
 *                 text: 'Click me',
 *                 // Note: DOM event handling for functional components is still under development.
 *                 // The `useEvent()` hook is the proposed solution.
 *                 // For now, this illustrates using the setter from useConfig.
 *                 onclick: () => setCount(count + 1)
 *             }]
 *         };
 *     },
 *
 *     // 3. Lifecycle hooks are automatically called.
 *     afterSetText(newValue, oldValue) {
 *         console.log(`Text changed from '${oldValue}' to '${newValue}'`);
 *     }
 * });
 *
 * // The returned MyComponent is a class constructor that can be used with Neo.create()
 * // const instance = Neo.create(MyComponent, {
 * //     text: 'Welcome to Neo.mjs!'
 * // });
 */
export function defineComponent(spec) {
    const staticSpec = spec.static;
    delete spec.static;

    if (!staticSpec?.className) {
        throw new Error('defineComponent requires a static config with a className.');
    }

    class FunctionalComponent extends FunctionalBase {
        static config = {
            ...staticSpec
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
