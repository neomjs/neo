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
     * Resolves the standalone 100,000-row grid example URL for the active Neo runtime environment.
     * @param {Object} [neoConfig=Neo.config]
     * @returns {String}
     */
    static resolveBigDataExampleUrl(neoConfig=Neo.config) {
        const
            basePath    = neoConfig?.basePath || '../../',
            environment = neoConfig?.environment,
            envPrefix   = environment && environment !== 'development' ? `${environment}/` : '';

        return `${basePath}${envPrefix}examples/grid/bigData/index.html`
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
                ntype: 'component',
                cls  : ['portal-audience-header'],
                flex : 'none',
                vdom : {
                    tag: 'header',
                    cn : [{
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
                                text: 'Ship desktop and mobile web apps on an off-main-thread runtime — 461 classes across 39 namespaces, persistent JSON-first components in Web Workers, zero runtime dependencies, and zero build step in dev mode.'
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
                                    text  : 'Proof: 100,000-row live grid ↗'
                                }]
                            }]
                        }
                    }, {
                        module   : Button,
                        cls      : ['portal-door-cta'],
                        flex     : 'none',
                        handler  : 'up.onScrollToBodyEntry',
                        reference: 'door-build-cta',
                        text     : 'Explore the Engine ↓',
                        ui       : 'secondary'
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
                                text: 'Deploy the open-source Agent OS and Fleet Manager on your own repository and infrastructure — persistent session memory, Hybrid GraphRAG, cross-family peer review, and live Neural Link runtime inspection.'
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
                                    text: 'Proof: cross-family PR #15123 record →'
                                }]
                            }]
                        }
                    }, {
                        module   : Button,
                        cls      : ['portal-door-cta'],
                        flex     : 'none',
                        handler  : 'up.onScrollToAgentOs',
                        reference: 'door-agents-cta',
                        text     : 'Explore the Agent OS ↓',
                        ui       : 'secondary'
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
                                    text: 'Proof: architectural essay with primary receipts →'
                                }]
                            }]
                        }
                    }, {
                        module   : Button,
                        cls      : ['portal-door-cta'],
                        flex     : 'none',
                        reference: 'door-study-cta',
                        route    : '/learn/benefits/Introduction',
                        text     : 'Read What Is Neo.mjs? →',
                        ui       : 'secondary'
                    }]
                }]
            }]
        }]
    }

    /**
     * Syncs the runtime-resolved example proof link with the active Neo.config on construction.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

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
}

export default Neo.setupClass(AudienceDoors);
