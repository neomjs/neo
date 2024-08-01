import BaseComponent from '../component/Base.mjs';
import VDomUtil from '../util/VDom.mjs';

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
         * In case the browser does not support the video source
         * the component should show an error.
         * @member {Boolean} errorMsg='The browser does not support the video'
         */
        errorMsg: 'Your browser does not support the video tag.',
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
        me.addDomListeners(
            {click: me.play, delegate: '.neo-video-ghost'},
            {click: me.pause, delegate: '.neo-video-media'}
        )
    }

    /**
     * beforeSetPlaying autgen by playing_
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @returns {Boolean}
     */
    beforeSetPlaying(value, oldValue) {
        if (!Neo.isBoolean(value)) {
            return oldValue
        }

        return value
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
     * afterSetUrl
     * Add a source element into the video element containing the url
     *
     * @param {String} value
     * @param {String|null} oldValue
     */
    afterSetUrl(value, oldValue) {
        if (!value) return;

        let {vdom} = this,
            media = VDomUtil.getFlags(vdom, 'media')[0];

        media.cn = [{
            tag: 'source',
            src: value,
            type: this.type
        }, {
            tag: 'span',
            html: this.errorMsg,
        }];

        this.update()
    }

    /**
     * autoplay - run the event listeners
     */
    handleAutoplay() {
        if (!this.autoplay) return;

        let {vdom} = this,
            media = VDomUtil.getFlags(vdom, 'media')[0];

        // Most browsers require videos to be muted for autoplay to work.
        media.muted = true;
        // Allows inline playback on iOS devices
        media.playsInline = true;

        this.update();
        this.playing = true;
    }

    /**
     * Clicked media
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

Neo.setupClass(Video);

export default Video;
