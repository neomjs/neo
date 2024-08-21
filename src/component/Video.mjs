import BaseComponent from '../component/Base.mjs';
import VDomUtil      from '../util/VDom.mjs';

/**
 * @class Neo.component.Video
 * @extends Neo.component.Base
 *
 * @example
 *     ntype   : 'video',
 *     url     : 'https://video-ssl.itunes.apple.com/itunes-assets/Video125/v4/a0/57/54/a0575426-dd8e-2d25-bdf3-139702870b50/mzvf_786190431362224858.640x464.h264lc.U.p.m4v'
 *     autoplay: true
 *
 * @methods
 *      play
 *      pause
 */
class Video extends BaseComponent {
    static config = {
        /*
         * @member {String} className='Neo.component.Video'
         * @protected
         */
        className: 'Neo.component.Video',
        /*
         * @member {String} ntype='video'
         * @protected
         */
        ntype: 'video',
        /*
         * @member {String[]} baseCls=['neo-video']
         */
        baseCls: ['neo-video'],
        /**
         * Automatically start the video
         * Initial setting, which does not make sense to change later
         * !!Most browsers only support muted autostart
         * @member {Boolean} autoplay=false
         */
        autoplay: false,
        /**
         * Current state of the video
         * @member {Boolean} playing_=false
         */
        playing_: false,
        /**
         * Type of the video
         * @member {String} type='video/mp4'
         */
        type: 'video/mp4',
        /*
         * @member {String|null} url_=null
         */
        url_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                flag: 'ghost',
                cls: ['neo-video-ghost'],
                cn: [{
                    tag: 'i',
                    cls: ['fa-solid', 'fa-circle-play']
                }]
            }, {
                // Neo specific configs
                tag: 'video',
                flag: 'media',
                cls: ['neo-video-media'],
                removeDom: true,
                // dom attributes
                autoplay: true,
                controls: true
            }]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.handleAutoplay();
        me.addDomListeners({click: me.play, delegate: '.neo-video-ghost'});
    }

    /**
     * afterSetPlaying - run the event listeners
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetPlaying(value, oldValue) {
        let {vdom} = this,
            media = VDomUtil.getFlags(vdom, 'media')[0],
            ghost = VDomUtil.getFlags(vdom, 'ghost')[0];

        ghost.removeDom = value;
        media.removeDom = !value;

        this.update()
    }

    /**
     * Add a source element into the video element containing the url
     * @param {String} value
     * @param {String|null} oldValue
     */
    afterSetUrl(value, oldValue) {
        if (!value) return;

        let me     = this,
            {vdom} = me,
            media  = VDomUtil.getFlags(vdom, 'media')[0];

        media.cn = [{
            tag : 'source',
            src : value,
            type: me.type
        }];

        this.update()
    }

    /**
     * autoplay - run the event listeners
     * Only called in constructor and sets playing => calls update already
     *
     * Rationale: update() sends the vdom & vnode on a workers roundtrip to get the deltas.
     * While this is happening,  the component locks itself for future updates until the new vnode got back (async).
     * After the delay the framework  would trigger a 2nd roundtrip to get the deltas for the visible node.
     *
     * @protected
     */
    handleAutoplay() {
        if (!this.autoplay) return;

        let {vdom} = this,
            media  = VDomUtil.getFlags(vdom, 'media')[0];

        // Most browsers require videos to be muted for autoplay to work.
        media.muted = true;
        // Allows inline playback on iOS devices
        media.playsInline = true;

        this.playing = true
    }

    /**
     * Simulates `Clicked media` programmatically
     */
    pause() {
        this.playing = false
    }

    /**
     * Clicked ghost
     */
    play() {
        this.playing = true
    }
}

export default Neo.setupClass(Video);
