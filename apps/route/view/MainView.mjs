import MainViewController from './MainViewController.mjs';
import HeaderContainer from './HeaderContainer.mjs';
import FooterContainer from './FooterContainer.mjs';
import CenterContainer from './CenterContainer.mjs';
import ButtonBar from './ButtonBar.mjs';
import Panel from '../../../src/container/Panel.mjs';
import MetaContainer from './MetaContainer.mjs';

/**
 * @class Route.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Panel {
    static config = {
        /**
         * @member {String} className='Route.view.MainContainer'
         * @protected
         */
        className: 'Route.view.MainView',
        baseCls: ['route'],
        /**
         * @member {Boolean} autoMount=true
         */
        //        autoMount: true,
        /**
         * @member {Neo.controller.Component} controller=MainViewController
         */
        controller: MainViewController,
        /**
         * @member {headers[]} items
         */
        headers: [
            {
                module: HeaderContainer,
                dock: 'top'
            },
            {
                module: ButtonBar,
                dock: 'top',
                reference: 'buttonbar',

            },
            {
                module: FooterContainer,
                dock: 'bottom'
            },
            {
                module: MetaContainer,
                dock: 'bottom',
                reference: 'metabar',
            }
        ],
        items: [
            {
                module: CenterContainer,
                reference: 'center-container'

            }
        ],

    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
