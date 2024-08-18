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
         * If you want to use the LivePreview, use the config livePreviewCode.
         * For custom content, use this config instead.
         * @member {Object[]|null} contentItems_=null
         */
        contentItems_: null,
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
         * @member {String} textContainerPosition_='start'
         */
        textContainerPosition_: 'start',
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
            module   : Container,
            cls      : 'portal-content-wrapper',
            layout   : 'fit',
            reference: 'portal-content-wrapper'
        }]
    }

    /**
     *
     */
    async activate() {
        let me       = this,
            {parent} = me;

        if (me.livePreviewCode) {
            await me.timeout(1000);

            if (parent.activePartsId === me.id && parent.mounted) {
                me.getReference('live-preview').activeView = 'preview'
            }
        }
    }

    /**
     * Triggered after the contentItems config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetContentItems(value, oldValue) {
        value ??= [{
            module   : LivePreview,
            cls      : ['page-live-preview'],
            reference: 'live-preview',
            value    : this.livePreviewCode
        }]

        this.getItem('portal-content-wrapper').items = value
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
        // the initial value will get handled via afterSetContentItems()
        if (oldValue) {
            this.getItem('live-preview').value = value
        }
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
     * Triggered after the textContainerPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTextContainerPosition(value, oldValue) {
        this.toggleCls('portal-position-end', value === 'end')
    }

    /**
     * Triggered before the textContainerPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetTextContainerPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'textContainerPosition')
    }
}

export default Neo.setupClass(FeatureSection);
