import Button   from '../../src/button/Base.mjs';
import Video    from '../../src/component/Video.mjs';
import Viewport from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.videoMove.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.videoMove.MainContainer',
        cls      : ['examples-videomove-maincontainer'],
        layout   : {ntype: 'vbox', align: 'stretch'},

        items: [{
            ntype : 'container',
            cls   : ['video-wrapper'],
            layout: {ntype: 'hbox', align: 'stretch'},

            itemDefaults: {
                ntype : 'container',
                layout: 'fit'
            },

            items: [{
                reference: 'container-1',

                items: [{
                    module : Video,
                    playing: true,
                    url    : 'https://video-ssl.itunes.apple.com/itunes-assets/Video125/v4/a0/57/54/a0575426-dd8e-2d25-bdf3-139702870b50/mzvf_786190431362224858.640x464.h264lc.U.p.m4v'
                }]
            }, {
                reference: 'container-2'
            }]
        }, {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'start'},
            style : {marginTop: '50px'},

            items: [{
                module : Button,
                handler: 'up.onMoveVideoButtonClick',
                text   : 'Move Video'
            }]
        }]
    }

    /**
     *
     * @param {Object} data
     */
    onMoveVideoButtonClick(data) {
        let me         = this,
            container1 = me.getReference('container-1'),
            container2 = me.getReference('container-2');

        container1.silentVdomUpdate = true;
        container2.silentVdomUpdate = true;

        if (container2.items.length < 1) {
            container2.add(container1.removeAt(0, false))
        } else {
            container1.add(container2.removeAt(0, false))
        }

        me.promiseUpdate().then(() => {
            container1.silentVdomUpdate = false;
            container2.silentVdomUpdate = false
        })
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
