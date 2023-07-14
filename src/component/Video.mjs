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
         * @member {String} ntype='neo-video'
         * @protected
         */
        ntype: 'video',
        /*
         * @member {[String]} cls=['neo-video']
         */
        baseCls: ['neo-video'],
        /*
         * @member {String} url=null
         * @public
         */
        url_: null,

        /**
         * Current state of the video
         * @member {boolean} playing=false
         */
        playing_: false,
        /**
         * Type of the video
         * @member {boolean} type='video/mp4'
         */
        type: 'video/mp4',

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
     * construct is earlier in component life cicle than init
     *
     * @param config
     */
    construct(config) {
        super.construct(config);

        console.log(this);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click   : me.play,
            delegate: '.neo-video-ghost'
        }, {
            click   : me.pause,
            delegate: '.neo-video-media'
        });

        me.domListeners = domListeners;
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
            return oldValue;
        }

        return value;
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

        this.vdom = vdom;
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
            return;
        }

        const me = this;
        let vdom  = me.vdom,
            media = vdom.cn[1];

        media.cn = [{
            tag : 'source',
            src : value,
            type: me.type
        }];

        me.vdom = vdom;
    }

    /**
     * Clicked ghost
     */
    play() {
        this.playing = true;
    }

    /**
     * Clicked media
     */
    pause() {
        this.playing = false;
    }
}

Neo.applyClassConfig(Video);

export default Video;