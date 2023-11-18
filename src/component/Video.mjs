import BaseComponent from '../component/Base.mjs';
import VDomUtil      from '../util/VDom.mjs';

/**
 * @class Neo.component.Video
 * @extends Neo.component.Base
 *
 * @example
 *     ntype: 'video',
 *     url: 'https://video-ssl.itunes.apple.com/itunes-assets/Video125/v4/a0/57/54/a0575426-dd8e-2d25-bdf3-139702870b50/mzvf_786190431362224858.640x464.h264lc.U.p.m4v'
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
                cls : ['neo-video-ghost'],
                cn  : [{
                    // The <i> tag defines a part of text in an alternate voice or mood. The content inside is typically displayed in italic.
                    tag: 'i',
                    cls: ['fa-solid', 'fa-circle-play']
                }]
            }, {
                // Neo specific configs
                tag      : 'video',
                flag     : 'media',
                removeDom: true,
                cls      : ['neo-video-media'],
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

        me.addDomListeners(
            {click: me.play,  delegate: '.neo-video-ghost'},
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
        let vdom  = this.vdom,
            media = VDomUtil.getFlags(vdom, 'media')[0],
            ghost = VDomUtil.getFlags(vdom, 'ghost')[0];

        ghost.removeDom = value;
        media.removeDom = !value;

        this.vdom = vdom
    }

    /**
     * afterSetUrl
     * Add a source element into the video element containing the url
     *
     * @param {String} value
     * @param {String|null} oldValue
     */
    afterSetUrl(value, oldValue) {
        if (!value) {
            return
        }

        const me = this;
        let vdom  = me.vdom,
            media = vdom.cn[1];

        media.cn = [{
            tag : 'source',
            src : value,
            type: me.type
        }];

        me.vdom = vdom
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

Neo.applyClassConfig(Video);

export default Video;
