import Button      from '../../../../src/button/Base.mjs';
import Container   from '../../../../src/container/Base.mjs';
import LivePreview from '../../../../src/code/LivePreview.mjs';

/**
 * @summary One snap page of the home: a headline block beside, or above, a live preview or custom content.
 *
 * A page that proves a component puts its text on top and shows the live preview side by side, so a visitor
 * sees the code and what it builds at once. The preview runs when the page becomes the active one, not when
 * the home is created.
 * @class Portal.view.home.FeatureSection
 * @extends Neo.container.Base
 */
class FeatureSection extends Container {
    /**
     * Valid values for textContainerPosition
     * @member {String[]} textContainerPositions=['start','end','top']
     * @protected
     * @static
     */
    static textContainerPositions = ['start', 'end', 'top']

    static config = {
        /**
         * @member {String} className='Portal.view.home.FeatureSection'
         * @protected
         */
        className: 'Portal.view.home.FeatureSection',
        /**
         * @member {String[]} baseCls=['portal-home-feature-section','portal-home-content-view','neo-container']
         * @protected
         */
        baseCls: ['portal-home-feature-section', 'portal-home-content-view', 'neo-container'],
        /**
         * If you want to use the LivePreview, use the config livePreviewCode.
         * For custom content, use this config instead.
         * @member {Object[]|null} contentItems_=null
         * @reactive
         */
        contentItems_: null,
        /**
         * @member {String|null} headline_=null
         * @reactive
         */
        headline_: null,
        /**
         * Can either contain a route or a URL
         * @member {String|null} learnMoreRoute_=null
         * @reactive
         */
        learnMoreRoute_: null,
        /**
         * Routes shown as a row of links under the paragraph, each `{route, text}`
         * @member {Object[]|null} links_=null
         * @reactive
         */
        links_: null,
        /**
         * The text in front of the links
         * @member {String} linksLabel='More components:'
         */
        linksLabel: 'More components:',
        /**
         * @member {String|null} livePreviewCode_=null
         * @reactive
         */
        livePreviewCode_: null,
        /**
         * @member {String|null} paragraph_=null
         * @reactive
         */
        paragraph_: null,
        /**
         * True shows the live preview's code beside its result (`Neo.code.LivePreview#sideBySide`)
         * @member {Boolean} sideBySide=false
         */
        sideBySide: false,
        /**
         * @member {String|null} subHeadline_=null
         * @reactive
         */
        subHeadline_: null,
        /**
         * Valid values: 'start', 'end' or 'top'
         * @member {String} textContainerPosition_='start'
         * @reactive
         */
        textContainerPosition_: 'start',
        /**
         * @member {String} layout='base'
         * @reactive
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
                tag      : 'h2'
            }, {
                cls      : 'neo-h2',
                flex     : 'none',
                reference: 'sub-headline',
                tag      : 'h3'
            }, {
                flex     : 'none',
                reference: 'paragraph',
                tag      : 'p'
            }, {
                module   : Container,
                cls      : ['portal-content-links'],
                flex     : 'none',
                hidden   : true,
                layout   : 'base',
                reference: 'links'
            }, {
                module   : Button,
                reference: 'learn-more-button',
                text     : 'Learn more',
                ui       : 'secondary'
            }]
        }, {
            module   : Container,
            cls      : ['portal-content-wrapper'],
            layout   : 'fit',
            reference: 'portal-content-wrapper'
        }]
    }

    /**
     * @summary Runs the live preview once this page has been the active one for a second.
     * A tabbed preview switches to its Preview tab; a side-by-side one already shows both and runs its source.
     */
    async activate() {
        let me       = this,
            {parent} = me;

        if (me.livePreviewCode) {
            await me.timeout(1000);

            if (parent.activePartsId === me.id && parent.mounted) {
                let livePreview = me.getReference('live-preview');

                if (!me.sideBySide) {
                    livePreview.activeView = 'preview'
                }
                // Scrolling back to the page keeps what is there, as does an edit or a pop-out that ran it earlier
                else if (livePreview.getPreviewContainer().items.length < 1) {
                    livePreview.disableRunSource = false;
                    livePreview.doRunSource()
                }
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
        let {sideBySide} = this;

        // A side-by-side preview is its active view from the start: activate() runs it.
        // Its code column is half the page: the smaller type shows a snippet of 45 lines whole.
        value ??= [{
            module          : LivePreview,
            cls             : ['page-live-preview'],
            disableRunSource: sideBySide,
            editorConfig    : sideBySide ? {fontSize: 12, options: {folding: false, lineHeight: 14, lineNumbersMinChars: 3}} : null,
            reference       : 'live-preview',
            sideBySide,
            value           : this.livePreviewCode
        }];

        this.getItem('portal-content-wrapper').items = value
    }

    /**
     * Triggered after the links config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetLinks(value, oldValue) {
        if (value || oldValue) {
            // Before the items are created, getItem() returns the item's config object
            let links = this.getItem('links');

            links.hidden = !value?.length;
            links.items  = [
                {ntype: 'component', cls: ['portal-content-links-label'], tag: 'span', text: this.linksLabel},
                ...(value || []).map(({route, text}) => ({module: Button, route, text, ui: 'ghost'}))
            ]
        }
    }

    /**
     * Triggered after the learnMoreRoute config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLearnMoreRoute(value, oldValue) {
        let targetConfig = value.startsWith('http') ? 'url' : 'route';
        this.getItem('learn-more-button')[targetConfig] = value
    }

    /**
     * Triggered after the headline config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHeadline(value, oldValue) {
        this.getItem('headline').text = value
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
        this.getItem('paragraph').text = value
    }

    /**
     * Triggered after the subHeadline config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetSubHeadline(value, oldValue) {
        this.getItem('sub-headline').text = value
    }

    /**
     * Triggered after the textContainerPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTextContainerPosition(value, oldValue) {
        this.toggleCls('portal-position-end', value === 'end');
        this.toggleCls('portal-position-top', value === 'top')
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
