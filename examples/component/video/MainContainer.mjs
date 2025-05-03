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
                url      : 'https://video-ssl.itunes.apple.com/itunes-assets/Video125/v4/a0/57/54/a0575426-dd8e-2d25-bdf3-139702870b50/mzvf_786190431362224858.640x464.h264lc.U.p.m4v',
                flag     : 'video-component',
                minHeight: 400
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
