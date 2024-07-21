import Base from './BaseContainer.mjs';
import ContentBox    from '../ContentBox.mjs';
import Component          from '../../../../../src/component/Base.mjs';

/**
 * @class Portal.view.home.parts.Features
 * @extends Portal.view.home.parts.BaseContainer
 */
class Features extends Base {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Features'
         * @protected
         */
        className: 'Portal.view.home.parts.Features',
        /**
         * @member {String[]} cls=['portal-home-features']
         */
        cls: ['portal-home-features'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch',wrap:'wrap'}
         */

        layout: {ntype: 'vbox', align: 'stretch', wrap: 'wrap'},
        items: [{
            module: Component,
            style: {fontSize: '2em;'},
            vdom: {tag: 'ul'},
            html: `
                <li>The unique ability to code multi-window applications
                <li>App logic, DOM updates, and backend calls &mdash; all run in parallel threads
                <li>Easily handles over 40,000 DOM updates per second
                <li>Standards based JavaScript, with no special extensions or webpack processes
                <li>Component-based declarative code, with elegant state management, and easy debugging
            `,
            flex: 1,
        }, {
            module: Component,
            vdom: {tag: 'p'},
            // style: {textAlign: 'center'},
            html: `
                Scroll down to see some demos or go straight to the <a href="#/learn">Learning Section</a>.
                If you need help, read about <a>programming or training services</a>. 
            `,
            flex: 1,
        }]
    }
}

Neo.setupClass(Features);

export default Features;
