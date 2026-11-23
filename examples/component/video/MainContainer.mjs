import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Video                 from '../../../src/component/Video.mjs';

/**
 * @summary Component workbench stage for `Neo.component.Video`, exposing playback state and dimensions in the inspector.
 * @class Neo.examples.component.video.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.video.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.video.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Number} configItemLabelWidth=110
         */
        configItemLabelWidth: 110,
        /**
         * @member {Number} configItemWidth=230
         */
        configItemWidth: 230,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @summary Builds the inspector controls for `playing`, `height`, and `width`.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.playing,
            labelText: 'playing',
            listeners: {change: me.onConfigChange.bind(me, 'playing')}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 540,
            minValue : 135,
            stepSize : 15,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 240,
            stepSize : 20,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    /**
     * @summary Returns the `Neo.component.Video` config displayed on the workbench stage.
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module  : Video,
            autoPlay: true,
            height  : 180,
            // Big Buck Bunny Trailer — (c) 2008 Blender Foundation / www.bigbuckbunny.org (CC BY 3.0)
            url  : 'https://cdn.jsdelivr.net/gh/neomjs/pages@main/resources_pub/video/big-buck-bunny-trailer.mp4#t=3.9',
            width: 320
        }
    }
}

export default Neo.setupClass(MainContainer);
