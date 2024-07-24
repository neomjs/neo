import BaseContainer from './BaseContainer.mjs';
import ContentBox    from '../ContentBox.mjs';
import Component     from '../../../../../src/component/Base.mjs';

/**
 * @class Portal.view.home.parts.Features
 * @extends Portal.view.home.parts.BaseContainer
 */
class Features extends BaseContainer {
    static config = {
        className: 'Portal.view.home.parts.Features',
        cls: ['portal-home-features'],
        layout: {ntype: 'vbox', align: 'stretch', wrap: 'wrap'},
        items: [{
            module: BaseContainer,
            layout: {ntype: 'hbox'},
            itemDefaults: {
                module: Component,
                style: {width: '33%', margin: '0.5em'}
            },
            items: [{
                module: Component,
                html: `
                        <h2>Extremely High Performance</h2>
                        <ul>
                        <li>Multi-threaded via web workers
                        <li>Very fast rendering &mdash; easily handling over 40,000 DOM updates per second
                        </ul>

                        <p>Neo.mjs runs key processes in separate web workers, each running in a parallel thread: one thread for app logic, one for managing DOM updates, and one for communicating with the backend. And if you have specialized or processor-intensive tasks, you can easily spawn additional threads.</p>
                `
            }, {
                module: Component,
                html: `
                        <h2>Multi-Window Applications</h2>
                        <ul>
                        <li>Neo.mjs uniquely allows you to create multi-window applications
                        <li>Application logic, state, data, and component instances are seamlessly shared
                        </ul>
                        <p>Neo.mjs components can be rendered to the DOM for any shared web worker. Your app logic listeners to events, maintains state, and shares data, without caring where the component is rendering, even if it's to another browser window.</p>
                `
            }, {
            module: Component,
            html: `
                    <h2>Powerful Framework Features</h2>
                    <ul>
                    <li>Component-based, declaratively configured 
                    <li>Standard ECMAscript, without proprietary extenions
                    <li>Property lifecycle hooks, elegant state management
                    </ul>
                    <p>Neo.mjs components are abstract, and configured declaratively. This means you don't need to be an HTML expert to write your user interface. The library also has features that make it each to do data binding, and to detect property updates and events.</p>
            `
        }]
    }]
}
}

Neo.setupClass(Features);

export default Features;
