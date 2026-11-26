import Button                     from '../../../src/button/Base.mjs';
import CellModel                  from '../../../src/selection/grid/CellModel.mjs';
import Component                  from '../../../src/component/Base.mjs';
import Container                  from '../../../src/container/Base.mjs';
import GridContainer              from '../../../src/grid/Container.mjs';
import Label                      from '../../../src/component/Label.mjs';
import MainContainerController    from './MainContainerController.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import NumberField                from '../../../src/form/field/Number.mjs';
import Viewport                   from '../../../src/container/Viewport.mjs';
import {MAX_ORDER_QTY}            from './orderData.mjs';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    day  : '2-digit',
    month: 'short',
    year : 'numeric'
});

const integerFormatter = new Intl.NumberFormat('en-US');

/**
 * @summary Order Review Desk: an end-to-end local enterprise Grid workflow over `100,000`
 * deterministic orders (`autoInitRecords: false`) combining locked identifying/settlement columns, grouped headers,
 * exception filtering (`reapplyOnRecordChange: true`), typed `NumberField` cell editing (`1..50`), recalculated line
 * totals, deep-row buffered jumps, responsive mobile lock adaptation, and a zero-exceptions completion state.
 * @class Neo.examples.grid.orderReviewDesk.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.orderReviewDesk.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.orderReviewDesk.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-order-review-desk']
         */
        cls: ['neo-examples-grid-order-review-desk'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         */
        stateProvider: MainContainerStateProvider,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['order-desk-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                cls     : ['order-desk-heading-copy'],
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {tag: 'h1', cls: ['order-desk-title'], text: 'Order review desk'},
                    {tag: 'p', cls: ['order-desk-subtitle'], text: 'Triage invalid quantities (1–50) across 100,000 local orders, verify recalculated line totals, and clear the exception queue.'}
                ]}
            }, {
                module   : Label,
                cls      : ['order-desk-exception-pill'],
                flex     : 'none',
                reference: 'exceptionPill',
                bind     : {
                    cls : data => data.exceptionCount > 0
                        ? ['order-desk-exception-pill', 'has-exceptions']
                        : ['order-desk-exception-pill', 'is-clear'],
                    text: data => data.exceptionCount > 0
                        ? `${data.exceptionCount} ${data.exceptionCount === 1 ? 'exception' : 'exceptions'}`
                        : '0 exceptions · Clear'
                }
            }, {
                module         : Button,
                cls            : ['order-desk-theme-btn'],
                flex           : 'none',
                handler        : 'onThemeButtonClick',
                iconCls        : 'fa-solid fa-sun',
                reference      : 'themeButton',
                text           : 'Light theme',
                tooltip        : 'Switch between dark and light theme',
                ui             : 'secondary',
                useRippleEffect: false
            }]
        }, {
            module: Container,
            cls   : ['order-desk-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Container,
                cls   : ['order-desk-filter-group'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                role  : 'group',
                vdom  : {'aria-label': 'Order queue filter', cn: []},
                items : [{
                    module         : Button,
                    cls            : ['order-desk-filter-btn'],
                    handler        : 'onAllOrdersClick',
                    reference      : 'allOrdersButton',
                    useRippleEffect: false,
                    bind           : {
                        pressed: data => !data.exceptionsOnly,
                        text   : data => `All orders (${integerFormatter.format(data.totalOrders)})`
                    }
                }, {
                    module         : Button,
                    cls            : ['order-desk-filter-btn'],
                    handler        : 'onExceptionsOnlyClick',
                    reference      : 'exceptionsOnlyButton',
                    useRippleEffect: false,
                    bind           : {
                        pressed: data => data.exceptionsOnly,
                        text   : data => `Exceptions only (${data.exceptionCount})`
                    }
                }]
            }, {
                module         : Button,
                cls            : ['order-desk-action-btn'],
                flex           : 'none',
                handler        : 'onJumpDeepOrderClick',
                iconCls        : 'fa-solid fa-arrow-down-short-wide',
                reference      : 'jumpDeepButton',
                text           : 'Jump to ORD-099985',
                ui             : 'secondary',
                useRippleEffect: false
            }, {
                module         : Button,
                cls            : ['order-desk-action-btn'],
                flex           : 'none',
                handler        : 'onResetSeedClick',
                iconCls        : 'fa-solid fa-rotate-left',
                reference      : 'resetSeedButton',
                text           : 'Reset seed',
                ui             : 'secondary',
                useRippleEffect: false
            }, {
                module   : Label,
                cls      : ['order-desk-visible-count'],
                reference: 'visibleCountLabel',
                bind     : {
                    text: data => `Showing ${integerFormatter.format(data.visibleOrders)} of ${integerFormatter.format(data.totalOrders)}`
                }
            }]
        }, {
            module   : Label,
            cls      : ['order-desk-receipt'],
            flex     : 'none',
            reference: 'receiptBanner',
            vdom     : {role: 'status', 'aria-live': 'polite'},
            bind     : {text: data => data.lastReceipt}
        }, {
            module: GridContainer,
            bind  : {
                hidden: data => data.visibleOrders === 0,
                store : 'stores.orders'
            },
            cellEditing: true,
            flex       : 1,
            reference  : 'grid',

            // Keep `orderId` pinned on every viewport width; pin `Settlement` at `end` on desktop while unlocking it
            // on narrow/mobile screens (`<= 760px`) so `390px` viewports keep generous scrollable room for editing.
            responsiveLockPolicy: {
                breakpoints: [
                    {maxWidth: 760,  columns: {orderId: 'start', lineTotal: null,  exceptionReason: null}},
                    {maxWidth: 4000, columns: {orderId: 'start', lineTotal: 'end', exceptionReason: 'end'}}
                ]
            },

            viewConfig: {
                selectionModel: CellModel
            },

            columns: [{
                dataField: 'orderId',
                editable : false,
                locked   : 'start',
                text     : 'Order',
                width    : 116
            }, {
                text   : 'Customer',
                columns: [{
                    dataField: 'customer',
                    editable : false,
                    text     : 'Account',
                    width    : 162
                }, {
                    dataField: 'region',
                    editable : false,
                    text     : 'Region',
                    width    : 94
                }]
            }, {
                text   : 'Line Item',
                columns: [{
                    dataField: 'item',
                    editable : false,
                    text     : 'Component',
                    width    : 174
                }, {
                    cellAlign: 'right',
                    dataField: 'quantity',
                    editable : true,
                    text     : 'Quantity',
                    width    : 98,
                    renderer : ({record, value}) => [{
                        tag: 'span',
                        cls: record.hasException
                            ? ['order-desk-qty-value', 'is-invalid']
                            : ['order-desk-qty-value'],
                        text: String(value)
                    }],
                    editor: {
                        module           : NumberField,
                        clearable        : false,
                        errorTextMaxValue: ({maxValue}) => `Max ${maxValue} units`,
                        errorTextMinValue: ({minValue}) => `Min ${minValue} unit`,
                        maxValue         : MAX_ORDER_QTY,
                        minValue         : 1,
                        required         : true
                    }
                }, {
                    cellAlign: 'right',
                    dataField: 'unitPrice',
                    editable : false,
                    text     : 'Unit price',
                    type     : 'currency',
                    width    : 146
                }, {
                    dataField: 'sku',
                    editable : false,
                    text     : 'SKU',
                    width    : 148
                }, {
                    dataField: 'shipDate',
                    editable : false,
                    renderer : ({value}) => value instanceof Date ? dateFormatter.format(value) : '',
                    text     : 'Ship date',
                    width    : 192
                }]
            }, {
                locked : 'end',
                text   : 'Settlement',
                columns: [{
                    cellAlign: 'right',
                    dataField: 'lineTotal',
                    editable : false,
                    text     : 'Line total',
                    type     : 'currency',
                    width    : 120
                }, {
                    dataField: 'exceptionReason',
                    editable : false,
                    text     : 'Review status',
                    width    : 148,
                    renderer : ({record, value}) => [{
                        tag: 'span',
                        cls: record.hasException
                            ? ['order-desk-status-badge', 'is-exception']
                            : ['order-desk-status-badge', 'is-ok'],
                        text: value
                    }]
                }]
            }]
        }, {
            module   : Container,
            bind     : {hidden: data => data.visibleOrders > 0},
            cls      : ['order-desk-empty-state'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'center', pack: 'center'},
            reference: 'emptyState',
            vdom     : {role: 'status', 'aria-live': 'polite', cn: []},
            items    : [{
                module: Component,
                cls   : ['order-desk-empty-copy'],
                vdom  : {cn: [
                    {tag: 'h2', cls: ['order-desk-empty-title'], text: 'All order exceptions resolved'},
                    {tag: 'p', cls: ['order-desk-empty-body'], text: '0 exceptions remain across 100,000 local orders. Return to All orders to inspect your updated totals, or reset the deterministic seed.'}
                ]}
            }, {
                module: Container,
                cls   : ['order-desk-empty-actions'],
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                items : [{
                    module         : Button,
                    cls            : ['order-desk-action-btn'],
                    handler        : 'onAllOrdersClick',
                    reference      : 'emptyShowAllButton',
                    text           : 'Show all 100,000 orders',
                    useRippleEffect: false
                }, {
                    module         : Button,
                    cls            : ['order-desk-action-btn'],
                    handler        : 'onResetSeedClick',
                    reference      : 'emptyResetButton',
                    text           : 'Reset seed (6 exceptions)',
                    ui             : 'secondary',
                    useRippleEffect: false
                }]
            }]
        }, {
            module   : Label,
            cls      : ['order-desk-scope-footer'],
            flex     : 'none',
            reference: 'scopeFooter',
            text     : 'Local in-memory store (autoInitRecords: false) · 100,000 deterministic orders · Session edits live in memory and reset on reload.'
        }]
    }
}

export default Neo.setupClass(MainContainer);
