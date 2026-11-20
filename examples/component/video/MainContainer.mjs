import MainContainerController from "./MainContainerController.mjs";
import Panel                   from '../../../src/container/Panel.mjs';
import Video                   from '../../../src/component/Video.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.video.MainContainer
 * @extends Neo.examples.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.component.timer.MainContainer',
        controller: MainContainerController,

        items : [{
            ntype: 'panel',
            headers: [{
                dock: 'top',
                items: [{
                    ntype: 'component',
                    html : '<h1>Video Demo</h1>',
                    flex : 'none',
                    style: {textAlign: 'center'}
                }, {
                    ntype: 'component', flex: 1
                }, {
                    reference: 'theme-button',
                    iconCls  : 'fa fa-sun',
                    handler  : 'onToggleTheme',
                    style    : {height: '100%',padding: '0 40px',borderWidth: 0,borderLeftWidth: '1px',borderRadius: 0}
                }]
            }],
            items: [{
                module   : Video,
                // Big Buck Bunny Trailer — (c) 2008 Blender Foundation / www.bigbuckbunny.org (CC BY 3.0)
                url      : 'https://cdn.jsdelivr.net/gh/neomjs/pages@main/resources_pub/video/big-buck-bunny-trailer.mp4',
                flag     : 'video-component',
                minHeight: 400
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
