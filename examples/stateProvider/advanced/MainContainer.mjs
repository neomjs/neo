import Button                    from '../../../src/button/Base.mjs';
import Container                 from '../../../src/container/Base.mjs';
import MainContainerController   from './MainContainerController.mjs';
import MemberList                from './MemberList.mjs';
import ProfileFields             from './ProfileFields.mjs';
import StateProvider             from '../../../src/state/Provider.mjs';
import ThemeSwitcher             from '../../../src/button/ThemeSwitcher.mjs';
import Viewport                  from '../../../src/container/Viewport.mjs';
import {initialsOf, seedMembers} from './memberDefaults.mjs';

/**
 * @summary Demonstrates one hierarchical `Neo.state.Provider` driving a header, form, nested override panel, dialog, and second browser window.
 * @class Neo.examples.stateProvider.advanced.MainContainer
 * @extends Neo.container.Viewport
 * @see Neo.state.Provider
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.MainContainer',
        /**
         * @member {String[]} cls=['sp-advanced-viewport']
         */
        cls: ['sp-advanced-viewport'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {String} layout='base'
         * @reactive
         */
        layout: 'base',
        /**
         * Root StateProvider owning the `members` store, active `member` record, and workspace `density`.
         * @member {Object|Neo.state.Provider} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            data  : {
                canOpenPopup : false,
                companionOpen: false,
                density      : 'Comfortable',
                dialogOpen   : false,
                member       : null,
                surfaceNotice: 'Every surface reads and edits the same Neo.data.Record.'
            },
            stores: {
                members: {
                    model: {
                        keyProperty: 'id',
                        fields     : [
                            {name: 'id',         type: 'String'},
                            {name: 'name',       type: 'String'},
                            {name: 'role',       type: 'String'},
                            {name: 'location',   type: 'String'},
                            {name: 'statusNote', type: 'String'}
                        ]
                    },
                    data: seedMembers()
                }
            }
        }
    }

    /**
     * @summary Builds the shell, live bound header, member roster/form card, and nested StateProvider preview panel.
     */
    createItems() {
        const me = this;

        me.items = [{
            module: Container,
            cls   : ['sp-shell'],
            layout: 'base',
            bind  : {
                cls: data => ['sp-shell', data.density === 'Compact' ? 'sp-density-compact' : 'sp-density-comfortable']
            },
            items : [{
                module: Container,
                cls   : ['sp-hero'],
                layout: 'base',
                items : [{
                    module: Container,
                    cls   : ['sp-hero-top'],
                    layout: 'base',
                    items : [{
                        module: Container,
                        cls   : ['sp-hero-identity'],
                        layout: 'base',
                        items : [{
                            cls      : ['sp-avatar', 'sp-avatar-lg'],
                            reference: 'header-avatar',
                            bind     : {text: data => initialsOf(data['member.name'])}
                        }, {
                            module: Container,
                            cls   : ['sp-hero-copy'],
                            layout: 'base',
                            items : [{
                                tag : 'span',
                                cls : ['sp-eyebrow'],
                                text: 'One state, every surface · Neo.state.Provider'
                            }, {
                                tag      : 'h1',
                                cls      : ['sp-hero-name'],
                                reference: 'header-name',
                                bind     : {text: data => data['member.name'] || ''}
                            }, {
                                tag      : 'p',
                                cls      : ['sp-hero-meta'],
                                reference: 'header-meta',
                                bind     : {text: data => `${data['member.role'] || ''} · ${data['member.location'] || ''}`}
                            }, {
                                module: Container,
                                cls   : ['sp-hero-pills'],
                                layout: 'base',
                                items : [{
                                    tag      : 'span',
                                    cls      : ['sp-pill', 'sp-pill-accent'],
                                    reference: 'header-status',
                                    bind     : {text: data => data['member.statusNote'] || ''}
                                }, {
                                    tag      : 'span',
                                    cls      : ['sp-pill'],
                                    reference: 'header-density',
                                    bind     : {text: data => `Workspace density: ${data.density}`}
                                }]
                            }]
                        }]
                    }, {
                        module: Container,
                        cls   : ['sp-hero-actions'],
                        layout: 'base',
                        items : [{
                            module   : Button,
                            cls      : ['sp-btn-primary'],
                            handler  : 'onOpenDialogClick',
                            iconCls  : 'fa fa-window-maximize',
                            reference: 'open-dialog-button',
                            bind     : {text: data => data.dialogOpen ? 'Close dialog' : 'Edit in dialog'}
                        }, {
                            module   : Button,
                            cls      : ['sp-btn-secondary'],
                            handler  : 'onOpenSecondWindowClick',
                            iconCls  : 'fa fa-up-right-from-square',
                            reference: 'open-window-button',
                            bind     : {
                                hidden: data => !data.canOpenPopup,
                                text  : data => data.companionOpen ? 'Focus second window' : 'Open second window'
                            }
                        }, {
                            module: ThemeSwitcher
                        }]
                    }]
                }, {
                    tag      : 'p',
                    cls      : ['sp-try-line'],
                    reference: 'try-line',
                    bind     : {
                        text: data => data.canOpenPopup
                            ? 'Type in the form, open the dialog, or launch a second window — every surface edits one shared record, while the preview panel overrides density locally.'
                            : 'Type in the form or open the dialog — every surface edits one shared record, while the preview panel overrides density locally.'
                    }
                }]
            }, {
                module: Container,
                cls   : ['sp-grid'],
                layout: 'base',
                items : [{
                    module: Container,
                    cls   : ['sp-card', 'sp-editor-card'],
                    layout: 'base',
                    items : [{
                        cls : ['sp-card-head'],
                        vdom: {cn: [
                            {tag: 'span', cls: ['sp-eyebrow'], text: 'Root StateProvider · stores.members'},
                            {tag: 'h2',   cls: ['sp-card-title'], text: 'Team profile & workspace form'}
                        ]}
                    }, {
                        module   : MemberList,
                        reference: 'member-list',
                        bind     : {store: 'stores.members'},
                        listeners: {
                            itemClick: 'onMemberItemClick',
                            select   : 'onMemberSelect'
                        }
                    }, {
                        module       : ProfileFields,
                        reference    : 'main-fields',
                        surfacePrefix: 'form'
                    }, {
                        module: Container,
                        cls   : ['sp-card-actions'],
                        layout: 'base',
                        items : [{
                            module   : Button,
                            cls      : ['sp-btn-secondary'],
                            handler  : 'onToggleRootDensityClick',
                            reference: 'toggle-root-density-button',
                            bind     : {text: data => data.density === 'Comfortable' ? 'Use Compact workspace' : 'Use Comfortable workspace'}
                        }, {
                            module   : Button,
                            cls      : ['sp-btn-secondary'],
                            handler  : 'onResetMemberClick',
                            reference: 'reset-member-button',
                            text     : 'Reset member'
                        }]
                    }]
                }, {
                    module   : Container,
                    cls      : ['sp-card', 'sp-nested-card'],
                    layout   : 'base',
                    reference: 'nested-preview-panel',
                    /**
                     * Nested StateProvider overriding `density` locally while inheriting `member` from MainContainer.
                     */
                    stateProvider: {
                        module: StateProvider,
                        data  : {
                            density: 'Compact'
                        }
                    },
                    items: [{
                        cls : ['sp-card-head'],
                        vdom: {cn: [
                            {tag: 'span', cls: ['sp-eyebrow'], text: 'Nested StateProvider override'},
                            {tag: 'h2',   cls: ['sp-card-title'], text: 'Directory card preview'},
                            {tag: 'p',    cls: ['sp-card-desc'], text: 'Declares its own nested stateProvider (density: "Compact") while inheriting the active member record from the parent.'}
                        ]}
                    }, {
                        module: Container,
                        cls   : ['sp-scope-ledger'],
                        layout: 'base',
                        items : [{
                            module: Container,
                            cls   : ['sp-scope-row'],
                            layout: 'base',
                            items : [
                                {tag: 'span',   cls: ['sp-scope-label'], text: 'Inherited from root (member.name)'},
                                {tag: 'strong', cls: ['sp-scope-value'], reference: 'nested-inherited-name', bind: {text: data => data['member.name'] || ''}}
                            ]
                        }, {
                            module: Container,
                            cls   : ['sp-scope-row', 'sp-scope-row-override'],
                            layout: 'base',
                            items : [
                                {tag: 'span',   cls: ['sp-scope-label'], text: 'Nested override (data.density)'},
                                {tag: 'strong', cls: ['sp-scope-value'], reference: 'nested-override-density', bind: {text: data => data.density}}
                            ]
                        }]
                    }, {
                        module   : Container,
                        reference: 'nested-preview-badge',
                        layout   : 'base',
                        bind     : {
                            cls: data => ['sp-preview-badge', data.density === 'Compact' ? 'sp-preview-compact' : 'sp-preview-comfortable']
                        },
                        items: [{
                            cls : ['sp-avatar', 'sp-avatar-sm'],
                            bind: {text: data => initialsOf(data['member.name'])}
                        }, {
                            module: Container,
                            cls   : ['sp-preview-meta'],
                            layout: 'base',
                            items : [
                                {tag: 'strong', cls: ['sp-preview-name'],   bind: {text: data => data['member.name'] || ''}},
                                {tag: 'span',   cls: ['sp-preview-role'],   bind: {text: data => `${data['member.role'] || ''} · ${data['member.location'] || ''}`}},
                                {tag: 'span',   cls: ['sp-preview-status'], bind: {text: data => data['member.statusNote'] || ''}}
                            ]
                        }, {
                            tag : 'span',
                            cls : ['sp-pill'],
                            bind: {text: data => data.density}
                        }]
                    }, {
                        module: Container,
                        cls   : ['sp-card-actions'],
                        layout: 'base',
                        items : [{
                            module   : Button,
                            cls      : ['sp-btn-secondary'],
                            handler  : 'onFlipNestedDensityClick',
                            reference: 'flip-nested-density-button',
                            bind     : {text: data => data.density === 'Compact' ? 'Override panel to Comfortable' : 'Override panel to Compact'}
                        }]
                    }]
                }]
            }, {
                tag      : 'p',
                cls      : ['sp-status-bar'],
                reference: 'surface-notice',
                role     : 'status',
                bind     : {text: data => data.surfaceNotice}
            }]
        }];

        super.createItems()
    }

    /**
     * @summary Forwards viewport theme changes to any open ProfileDialog in this window.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        if (this.controller?.dialog && !this.controller.dialog.isDestroyed) {
            this.controller.dialog.theme = value
        }
    }
}

export default Neo.setupClass(MainContainer);
