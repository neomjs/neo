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
            ntype    : 'container',
            cls      : ['video-wrapper'],
            layout   : {ntype: 'hbox', align: 'stretch'},
            reference: 'video-wrapper',

            itemDefaults: {
                ntype : 'container',
                layout: 'fit'
            },

            items: [{
                reference: 'container-1',

                items: [{
                    module : Video,
                    playing: true,
                    // Big Buck Bunny Trailer — (c) 2008 Blender Foundation / www.bigbuckbunny.org (CC BY 3.0)
                    url    : 'https://cdn.jsdelivr.net/gh/neomjs/pages@main/resources_pub/video/big-buck-bunny-trailer.mp4'
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
        let me           = this,
            container1   = me.getReference('container-1'),
            container2   = me.getReference('container-2'),
            videoWrapper = me.getReference('video-wrapper');

        container1.silentVdomUpdate = true;
        container2.silentVdomUpdate = true;

        if (container2.items.length < 1) {
            container2.add(container1.removeAt(0, false))
        } else {
            container1.add(container2.removeAt(0, false))
        }

        // include 2 level of children:
        // level 1 => container-1, container-2
        // level 2 => video element(s)
        videoWrapper.updateDepth = 3;

        videoWrapper.promiseUpdate().then(() => {
            container1.silentVdomUpdate = false;
            container2.silentVdomUpdate = false
        })
    }
}

export default Neo.setupClass(MainContainer);
