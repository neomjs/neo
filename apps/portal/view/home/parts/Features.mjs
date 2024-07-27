import BaseContainer from './BaseContainer.mjs';
import ContentBox    from '../ContentBox.mjs';
import Component     from '../../../../../src/component/Base.mjs';
import Container     from '../../../../../src/container/Base.mjs';


/**
 * @class Portal.view.home.parts.Features
 * @extends Portal.view.home.parts.BaseContainer
 */
class Features extends BaseContainer {
    static config = {
        className: 'Portal.view.home.parts.Features',
        cls: ['portal-home-features'],
        layout: {ntype: 'vbox', align: 'stretch', wrap: 'wrap'},
        items: [
            {
            module: Container,
            layout: {ntype: 'hbox'},
            itemDefaults: {
                module: Component,
                style: {width: '33%', margin: '1em', padding: '1em', border: 'thin solid lightgray'}
            },
            items: [{
                module: Component,
                html: `
                        <h2>Extremely High Performance</h2>
                        <ul>
                        <li>Multi-threaded via web workers
                        <li>Lightning fast rendering
                        </ul>
                        <p>Neo.mjs runs key processes in separate web workers, each running in a parallel thread: one thread for app logic, one for managing DOM updates, and one for communicating with the backend. And if you have specialized or processor-intensive tasks, you can easily spawn additional threads.</p>
                        <p>Besides the benefit of running in a separate thread, the DOM update thread has highly optimized code for tracking and applying delta updates, easily handling tens of thousands of updates per second.</p>
                `
            }, {
                module: Component,
                html: `
                        <h2>Multi-Window Applications</h2>
                        <ul>
                        <li>Neo.mjs uniquely allows you to create multi-window applications
                        <li>Application logic, state, data, and component instances are seamlessly shared
                        </ul>
                        <p>Neo.mjs components can be rendered to the DOM for any shared web worker. Your app logic listens to events, maintains state, and shares data, without caring where the component is rendering, even if it's to another browser window.</p>
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
                    <p>Neo.mjs components are abstract, and configured declaratively. Compared to other libraries, Neo.mjs has features that make it much easier to do data binding, and to detect property updates and events.</p>
                    <p>Since Neo.mjs uses standard JavaScript, there are no special WebPack transpilations. This also makes debugging easier: any statement you write in your application logic also runs in the devtools console.</p>
            `
        }]
         },  {
            module: Component,
            html: 'You can read more about Neo.mjs featuers and benefits in <a href="#/learn/WhyNeo-Features">the Learning section</a>. Scroll down to see some running examples.'
        }]
}
}

Neo.setupClass(Features);

export default Features;
