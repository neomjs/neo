import Button                  from '../../src/button/Base.mjs';
import Component               from '../../src/component/Base.mjs';
import Container               from '../../src/container/Base.mjs';
import Label                   from '../../src/component/Label.mjs';
import MainContainerController from './MainContainerController.mjs';
import ThemeSwitcher           from '../../src/button/ThemeSwitcher.mjs';
import Video                   from '../../src/component/Video.mjs';
import Viewport                from '../../src/container/Viewport.mjs';

/**
 * @summary Demonstrates moving a playing `<video>` element between two containers without recreating or restarting it.
 * @class Neo.examples.videoMove.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.videoMove.MainContainer'
         * @protected
         */
        className: 'Neo.examples.videoMove.MainContainer',
        /**
         * @member {String[]} cls=['examples-videomove-maincontainer']
         */
        cls: ['examples-videomove-maincontainer'],
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
            cls   : ['neo-videomove-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Component,
                flex  : 1,
                tag   : 'h1',
                text  : 'Moving a playing video'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Component,
            cls   : ['neo-videomove-intro'],
            flex  : 'none',
            tag   : 'p',
            text  : 'Press Move Video while the clip plays: the live <video> element moves to the other panel and keeps playing.'
        }, {
            module: Container,
            cls   : ['neo-videomove-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module   : Button,
                flex     : 'none',
                handler  : 'onMoveVideoButtonClick',
                iconCls  : 'fa fa-right-left',
                reference: 'move-button',
                text     : 'Move Video'
            }, {
                module   : Label,
                cls      : ['neo-videomove-readout'],
                reference: 'status-readout',
                role     : 'status',
                text     : 'Playing in Panel A from 0:04 — press Move Video to watch playback continue uninterrupted.'
            }]
        }, {
            module   : Container,
            cls      : ['video-wrapper'],
            flex     : 1,
            layout   : null,
            reference: 'video-wrapper',
            items    : [{
                module: Container,
                cls   : ['neo-videomove-card'],
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    module: Container,
                    cls   : ['neo-videomove-card-header'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : [{
                        module: Component,
                        flex  : 1,
                        tag   : 'h2',
                        text  : 'Panel A'
                    }, {
                        module   : Label,
                        cls      : ['neo-videomove-badge'],
                        reference: 'panel-1-badge',
                        text     : 'Playing here'
                    }]
                }, {
                    module   : Container,
                    cls      : ['neo-videomove-stage'],
                    layout   : 'fit',
                    reference: 'container-1',
                    items    : [{
                        module   : Video,
                        autoPlay : true,
                        reference: 'player',
                        // Big Buck Bunny Trailer — (c) 2008 Blender Foundation / www.bigbuckbunny.org (CC BY 3.0)
                        url      : 'https://cdn.jsdelivr.net/gh/neomjs/pages@main/resources_pub/video/big-buck-bunny-trailer.mp4#t=3.8'
                    }]
                }]
            }, {
                module: Container,
                cls   : ['neo-videomove-card'],
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    module: Container,
                    cls   : ['neo-videomove-card-header'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : [{
                        module: Component,
                        flex  : 1,
                        tag   : 'h2',
                        text  : 'Panel B'
                    }, {
                        module   : Label,
                        cls      : ['neo-videomove-badge'],
                        reference: 'panel-2-badge',
                        text     : 'Ready to receive'
                    }]
                }, {
                    module   : Container,
                    cls      : ['neo-videomove-stage'],
                    layout   : 'fit',
                    reference: 'container-2'
                }]
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
