import Button                              from '../../../src/button/Base.mjs';
import Component                           from '../../../src/component/Base.mjs';
import Container                           from '../../../src/container/Base.mjs';
import Image                               from '../../../src/component/Image.mjs';
import MainContainerController, {profiles} from './MainContainerController.mjs';
import TabContainer                        from '../../../src/tab/Container.mjs';
import ThemeSwitcher                       from '../../../src/button/ThemeSwitcher.mjs';
import Viewport                            from '../../../src/container/Viewport.mjs';

/**
 * @summary Shows when a profile image travels over the network and when a tab opens from the cache.
 * @class Neo.examples.preloadingAssets.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.preloadingAssets.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.preloadingAssets.view.MainContainer',
        /**
         * @member {String[]} cls
         */
        cls: ['neo-preload-demo'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} listeners
         */
        listeners: {mounted: 'onMounted'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-preload-heading'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Component,
                flex  : 1,
                tag   : 'h1',
                text  : 'Ready before the click'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Component,
            cls   : ['neo-preload-intro'],
            flex  : 'none',
            tag   : 'p',
            text  : Neo.config.hasTouchEvents
                ? 'Tap Preload next tab to warm Alice’s portrait. When it’s ready, turn on Cache-only mode and open Alice.'
                : 'Hover over Alice’s tab or use Preload next tab. When her portrait is ready, turn on Cache-only mode and open Alice.'
        }, {
            module: Container,
            cls   : ['neo-preload-controls'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module : Button,
                handler: 'onPreloadNextTab',
                text   : 'Preload next tab'
            }, {
                module   : Button,
                handler  : 'onToggleCacheOnly',
                pressed  : false,
                reference: 'cache-only',
                text     : 'Cache-only mode'
            }, {
                module   : Component,
                cls      : ['neo-preload-counter'],
                reference: 'network-count',
                text     : 'Network loads 0'
            }, {
                module   : Component,
                cls      : ['neo-preload-counter'],
                reference: 'cache-count',
                text     : 'Cache opens 0'
            }]
        }, {
            module   : TabContainer,
            cls      : ['neo-preload-profiles'],
            flex     : 'none',
            reference: 'profiles',
            items    : profiles.map(({name, role}, index) => ({
                module: Container,
                cls   : ['neo-preload-profile'],
                header: {text: name},
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                items : [{
                    module   : Image,
                    alt      : 'Portrait of ' + name,
                    hidden   : true,
                    reference: 'portrait-' + index
                }, {
                    module: Component,
                    cls   : ['neo-preload-profile-copy'],
                    vdom  : {cn: [
                        {tag: 'h2', text: name},
                        {tag: 'p',  text: role}
                    ]}
                }]
            }))
        }, {
            module   : Component,
            cls      : ['neo-preload-activity'],
            flex     : 'none',
            reference: 'activity',
            role     : 'status',
            tag      : 'p',
            text     : 'Loading Bob’s portrait…'
        }]
    }
}

export default Neo.setupClass(MainContainer);
