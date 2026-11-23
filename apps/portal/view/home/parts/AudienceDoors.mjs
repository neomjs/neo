import BaseContainer from './BaseContainer.mjs';
import Button        from '../../../../../src/button/Base.mjs';
import                    '../../../../../src/layout/Grid.mjs';

/**
 * @summary Second-stage landing orientation view routing visitors by intent across Body, Brain, and Organism.
 *
 * Presents three equal-peer audience doors (`Build an application`, `Run an agent team`, `Study the model`)
 * immediately below the Hero stage so engineering, AI-platform, and research visitors each get a concrete
 * proof artifact and direct navigation path without crowding the opening viewport.
 *
 * @class Portal.view.home.parts.AudienceDoors
 * @extends Portal.view.home.parts.BaseContainer
 */
class AudienceDoors extends BaseContainer {
    /**
     * @summary Resolves the standalone 100,000-row grid example URL for browser and Node SSR runtimes.
     * @param {Object} [neoConfig=Neo.config]
     * @returns {String}
     */
    static resolveBigDataExampleUrl(neoConfig=Neo.config) {
        const rawBasePath = neoConfig?.basePath;

        if (!rawBasePath || rawBasePath.startsWith('node_modules/')) {
            return '/examples/grid/bigData/index.html'
        }

        const
            environment = neoConfig?.environment,
            envPrefix   = environment && environment !== 'development' ? `${environment}/` : '';

        return `${rawBasePath}${envPrefix}examples/grid/bigData/index.html`
    }

    /**
     * @summary Resolves an in-page Home stage anchor URL for browser and SSR documents.
     * @param {String|null} targetId
     * @param {Object} [neoConfig=Neo.config]
     * @returns {String|null}
     */
    static resolveSectionAnchorUrl(targetId, neoConfig=Neo.config) {
        if (!targetId) {
            return null
        }

        const rawBasePath = neoConfig?.basePath;

        if (!rawBasePath || rawBasePath.startsWith('node_modules/')) {
            return `/#${targetId}`
        }

        return `#${targetId}`
    }

    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.AudienceDoors'
         * @protected
         */
        className: 'Portal.view.home.parts.AudienceDoors',
        /**
         * @member {String} ntype='portal-home-parts-audiencedoors'
         * @protected
         */
        ntype: 'portal-home-parts-audiencedoors',
        /**
         * @member {String[]} cls=['portal-home-parts-audiencedoors']
         * @reactive
         */
        cls: ['portal-home-parts-audiencedoors'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center',pack:'center'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            cls  : ['content-wrapper'],
            flex : 'none',
            items: [{
                ntype    : 'component',
                cls      : ['portal-audience-header'],
                flex     : 'none',
                reference: 'audience-header',
                vdom     : {
                    tag     : 'header',
                    // A focus target for the hero's cue, never a Tab stop of its own
                    tabIndex: -1,
                    cn      : [{
                        tag : 'h2',
                        cls : ['neo-h1'],
                        text: 'Who Neo.mjs Is For'
                    }, {
                        tag : 'p',
                        cls : ['portal-audience-lead'],
                        text: 'One organism spans two hemispheres — a multi-threaded browser application engine (the Body) and the open-source Agent OS that inhabits it (the Brain).'
                    }]
                }
            }, {
                ntype : 'container',
                cls   : ['portal-audience-grid'],
                flex  : 'none',
                layout: {ntype: 'grid'},
                items : [{
                    ntype    : 'container',
                    cls      : ['portal-glass-card'],
                    reference: 'door-build',
                    items    : [{
                        ntype    : 'component',
                        cls      : ['portal-content-box-content', 'portal-door-body'],
                        flex     : 1,
                        reference: 'door-build-body',
                        vdom     : {
                            cn: [{
                                tag : 'span',
                                cls : ['portal-door-eyebrow'],
                                text: 'Web & Application Engineers · The Body'
                            }, {
                                tag : 'h3',
                                cls : ['portal-content-box-headline'],
                                text: 'Build an application'
                            }, {
                                tag : 'p',
                                cls : ['portal-door-copy'],
                                text: 'Ship desktop and mobile web apps on an off-main-thread runtime — 513 classes across 44 namespaces, persistent JSON-first components in Web Workers, zero runtime dependencies, and zero build step in dev mode.'
                            }, {
                                tag: 'div',
                                cls: ['portal-door-command'],
                                cn : [{
                                    tag : 'code',
                                    text: '$ npx neo-app@latest'
                                }]
                            }, {
                                tag: 'p',
                                cls: ['portal-door-proof'],
                                cn : [{
                                    tag   : 'a',
                                    flag  : 'door-build-proof-link',
                                    href  : AudienceDoors.resolveBigDataExampleUrl(),
                                    rel   : 'noopener noreferrer',
                                    target: '_blank',
                                    cn    : [
                                        {tag: 'span', text: 'Proof: 100,000-row live grid'},
                                        {tag: 'i', cls: ['fa', 'fa-arrow-up-right-from-square'], 'aria-hidden': true}
                                    ]
                                }]
                            }]
                        }
                    }, {
                        module      : Button,
                        cls         : ['portal-door-cta', 'portal-door-scroll-cta'],
                        flex        : 'none',
                        handler     : 'up.onScrollToBodyEntry',
                        iconCls     : 'fa fa-arrow-down',
                        iconPosition: 'right',
                        reference   : 'door-build-cta',
                        text        : 'Explore the Engine',
                        ui          : 'secondary',
                        urlTarget   : ''
                    }]
                }, {
                    ntype    : 'container',
                    cls      : ['portal-glass-card'],
                    reference: 'door-agents',
                    items    : [{
                        ntype    : 'component',
                        cls      : ['portal-content-box-content', 'portal-door-body'],
                        flex     : 1,
                        reference: 'door-agents-body',
                        vdom     : {
                            cn: [{
                                tag : 'span',
                                cls : ['portal-door-eyebrow'],
                                text: 'Engineering Teams & AI Architects · The Brain'
                            }, {
                                tag : 'h3',
                                cls : ['portal-content-box-headline'],
                                text: 'Run an agent team'
                            }, {
                                tag : 'p',
                                cls : ['portal-door-copy'],
                                text: 'Deploy the open-source Agent OS and Agent Institution on your own repository and infrastructure — persistent session memory, Hybrid GraphRAG, cross-family peer review, and live Neural Link runtime inspection.'
                            }, {
                                tag: 'div',
                                cls: ['portal-door-command'],
                                cn : [{
                                    tag : 'code',
                                    text: 'neo-agent-brain · neo-agent-institution'
                                }]
                            }, {
                                tag: 'p',
                                cls: ['portal-door-proof'],
                                cn : [{
                                    tag : 'a',
                                    href: '#/news/pulls/15123',
                                    cn  : [
                                        {tag: 'span', text: 'Proof: cross-family PR #15123 record'},
                                        {tag: 'i', cls: ['fa', 'fa-arrow-right'], 'aria-hidden': true}
                                    ]
                                }]
                            }]
                        }
                    }, {
                        module      : Button,
                        cls         : ['portal-door-cta', 'portal-door-scroll-cta'],
                        flex        : 'none',
                        handler     : 'up.onScrollToAgentOs',
                        iconCls     : 'fa fa-arrow-down',
                        iconPosition: 'right',
                        reference   : 'door-agents-cta',
                        text        : 'Explore the Agent OS',
                        ui          : 'secondary',
                        urlTarget   : ''
                    }]
                }, {
                    ntype    : 'container',
                    cls      : ['portal-glass-card'],
                    reference: 'door-study',
                    items    : [{
                        ntype    : 'component',
                        cls      : ['portal-content-box-content', 'portal-door-body'],
                        flex     : 1,
                        reference: 'door-study-body',
                        vdom     : {
                            cn: [{
                                tag : 'span',
                                cls : ['portal-door-eyebrow'],
                                text: 'Researchers & Systems Designers · The Organism'
                            }, {
                                tag : 'h3',
                                cls : ['portal-content-box-headline'],
                                text: 'Study the model'
                            }, {
                                tag : 'p',
                                cls : ['portal-door-copy'],
                                text: 'Examine how an autopoietic software organism governs itself in public — Model Experience (MX), two-hemisphere embodiment, and gated recursive self-improvement with human merge authority.'
                            }, {
                                tag: 'div',
                                cls: ['portal-door-command'],
                                cn : [{
                                    tag : 'code',
                                    text: 'MX · Two Hemispheres · Gated RSI'
                                }]
                            }, {
                                tag: 'p',
                                cls: ['portal-door-proof'],
                                cn : [{
                                    tag : 'a',
                                    href: '#/learn/benefits/Introduction',
                                    cn  : [
                                        {tag: 'span', text: 'Proof: architectural essay with primary receipts'},
                                        {tag: 'i', cls: ['fa', 'fa-arrow-right'], 'aria-hidden': true}
                                    ]
                                }]
                            }]
                        }
                    }, {
                        module      : Button,
                        cls         : ['portal-door-cta'],
                        flex        : 'none',
                        iconCls     : 'fa fa-arrow-right',
                        iconPosition: 'right',
                        reference   : 'door-study-cta',
                        route       : '/learn/benefits/Introduction',
                        text        : 'Read What Is Neo.mjs?',
                        ui          : 'secondary'
                    }]
                }]
            }]
        }]
    }

    /**
     * @summary Registers main-thread click default prevention for in-page scroll CTAs so browser smooth scrolling preserves the active route hash.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            Neo.main?.DomEvents?.registerPreventDefaultTargets?.({
                cls     : 'portal-door-scroll-cta',
                name    : 'click',
                windowId: this.windowId
            })
        }
    }

    /**
     * @summary Moves focus to the stage's header without scrolling, so a keyboard visitor who arrived through the hero's
     * cue continues with Tab inside this stage instead of jumping back to the cue's siblings.
     */
    focusHeader() {
        this.getItem('audience-header')?.focus(undefined, false, true)
    }

    /**
     * @summary Syncs the runtime-resolved example proof link with the active Neo.config once child items exist.
     */
    onConstructed() {
        super.onConstructed();

        const
            buildBody = this.getItem('door-build-body'),
            proofLink = buildBody?.vdom?.cn?.[4]?.cn?.[0];

        if (proofLink) {
            proofLink.href = AudienceDoors.resolveBigDataExampleUrl()
        }
    }

    /**
     * @summary Scrolls the Home container smoothly to the Agent OS stage.
     */
    onScrollToAgentOs() {
        this.up('portal-home-maincontainer')?.scrollToPart('home-agent-os')
    }

    /**
     * @summary Scrolls the Home container smoothly to the first Body feature stage.
     */
    onScrollToBodyEntry() {
        this.up('portal-home-maincontainer')?.scrollToPart('home-body-entry')
    }

    /**
     * @summary Binds Door 1 and Door 2 CTA anchor hrefs to the live Home stage element IDs.
     * @param {Neo.container.Base|null} [mainContainer=this.up('portal-home-maincontainer')]
     */
    syncSectionTargets(mainContainer=this.up('portal-home-maincontainer')) {
        const
            bodyEntryId = mainContainer?.getItem('home-body-entry')?.id,
            agentOsId   = mainContainer?.getItem('home-agent-os')?.id,
            buildCta    = this.getItem('door-build-cta'),
            agentsCta   = this.getItem('door-agents-cta');

        if (buildCta && bodyEntryId) {
            buildCta.url = AudienceDoors.resolveSectionAnchorUrl(bodyEntryId)
        }

        if (agentsCta && agentOsId) {
            agentsCta.url = AudienceDoors.resolveSectionAnchorUrl(agentOsId)
        }
    }
}

export default Neo.setupClass(AudienceDoors);
