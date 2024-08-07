import Button      from '../../../../src/button/Base.mjs';
import Container   from '../../../../src/container/Base.mjs';
import LivePreview from '../../../../src/code/LivePreview.mjs';

/**
 * @class Portal.view.home.FeatureSection
 * @extends Neo.container.Base
 */
class FeatureSection extends Container {
    /**
     * Valid values for textContainerPosition
     * @member {String[]} textContainerPositions=['start','end']
     * @protected
     * @static
     */
    static textContainerPositions = ['start', 'end']

    static config = {
        /**
         * @member {String} className='Portal.view.home.FeatureSection'
         * @protected
         */
        className: 'Portal.view.home.FeatureSection',
        /**
         * @member {String[]} baseCls=['portal-home-feature-section','neo-container']
         * @protected
         */
        baseCls: ['portal-home-feature-section', 'neo-container'],
        /**
         * @member {String|null} headline_=null
         */
        headline_: null,
        /**
         * @member {String|null} learnMoreRoute_=null
         */
        learnMoreRoute_: null,
        /**
         * @member {String|null} livePreviewCode_=null
         */
        livePreviewCode_: null,
        /**
         * @member {String|null} paragraph_=null
         */
        paragraph_: null,
        /**
         * @member {String|null} subHeadline_=null
         */
        subHeadline_: null,
        /**
         * Valid values: 'start' or 'end'
         * @member {String|null} textContainerPosition_=null
         */
        textContainerPosition_: null,
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['portal-content-text'],
            layout: 'base',

            itemDefaults: {
                flex: 'none'
            },

            items : [{
                cls      : 'neo-h1',
                flex     : 'none',
                reference: 'headline',
                tag      : 'h1'
            }, {
                cls      : 'neo-h2',
                flex     : 'none',
                reference: 'sub-headline',
                tag      : 'h2'
            }, {
                flex     : 'none',
                reference: 'paragraph',
                tag      : 'p'
            }, {
                module   : Button,
                reference: 'learn-more-button',
                text     : 'Learn more',
                ui       : 'secondary'
            }]
        }, {
            module: Container,
            cls   : 'portal-content-wrapper',
            layout: 'fit',
            items : [{
                module   : LivePreview,
                cls      : ['page-live-preview'],
                reference: 'live-preview'
            }]
        }]
    }

    /**
     *
     */
    async activate() {
        let me       = this,
            {parent} = me;

        await me.timeout(1000);

        if (parent.activePartsId === me.id && parent.mounted) {
            me.getReference('live-preview').activeView = 'preview'
        }
    }

    /**
     * Triggered after the learnMoreRoute config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLearnMoreRoute(value, oldValue) {
        this.getItem('learn-more-button').route = value
    }

    /**
     * Triggered after the headline config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHeadline(value, oldValue) {
        this.getItem('headline').html = value
    }

    /**
     * Triggered after the livePreviewCode config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLivePreviewCode(value, oldValue) {
        this.getItem('live-preview').value = value
    }

    /**
     * Triggered after the paragraph config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetParagraph(value, oldValue) {
        this.getItem('paragraph').html = value
    }

    /**
     * Triggered after the subHeadline config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetSubHeadline(value, oldValue) {
        this.getItem('sub-headline').html = value
    }

    /**
     * Triggered before the textContainerPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetBadgePosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'textContainerPosition')
    }
}

Neo.setupClass(FeatureSection);

export default FeatureSection;
