import Accordion             from '../../../../../src/container/Accordion.mjs';
import AccordionItem         from '../../../../../src/container/AccordionItem.mjs';
import Board                 from '../../../../../src/board/Container.mjs';
import BooleanContainer      from '../../../../../src/filter/BooleanContainer.mjs';
import BoxLabel              from '../../../../../src/component/BoxLabel.mjs';
import Breadcrumb            from '../../../../../src/toolbar/Breadcrumb.mjs';
import Button                from '../../../../../src/button/Base.mjs';
import Calendar              from '../../../../../src/calendar/view/MainContainer.mjs';
import CardModel             from '../../../../../src/board/CardModel.mjs';
import Carousel              from '../../../../../src/component/Carousel.mjs';
import CheckBox              from '../../../../../src/form/field/CheckBox.mjs';
import Chip                  from '../../../../../src/component/Chip.mjs';
import ChipField             from '../../../../../src/form/field/Chip.mjs';
import ChipList              from '../../../../../src/list/Chip.mjs';
import Clock                 from '../../../../../src/component/Clock.mjs';
import ComboBox              from '../../../../../src/form/field/ComboBox.mjs';
import Component             from '../../../../../src/component/Base.mjs';
import Container             from '../../../../../src/container/Base.mjs';
import CubeLayout            from '../../../../../src/layout/Cube.mjs';
import Dashboard             from '../../../../../src/dashboard/Container.mjs';
import DashboardPanel        from '../../../../../src/dashboard/Panel.mjs';
import DateSelector          from '../../../../../src/component/DateSelector.mjs';
import DateSelectorContainer from '../../../../../src/date/SelectorContainer.mjs';
import EmptyState            from '../../../../../src/component/EmptyState.mjs';
import Fieldset              from '../../../../../src/form/Fieldset.mjs';
import FileUpload            from '../../../../../src/form/field/FileUpload.mjs';
import FormContainer         from '../../../../../src/form/Container.mjs';
import Gantt                 from '../../../../../src/gantt/Container.mjs';
import GridContainer         from '../../../../../src/grid/Container.mjs';
import Icon                  from '../../../../../src/component/Icon.mjs';
import Label                 from '../../../../../src/component/Label.mjs';
import List                  from '../../../../../src/list/Base.mjs';
import Markdown              from '../../../../../src/component/Markdown.mjs';
import MenuList              from '../../../../../src/menu/List.mjs';
import NumberContainer       from '../../../../../src/filter/NumberContainer.mjs';
import NumberField           from '../../../../../src/form/field/Number.mjs';
import PageContainer         from '../../../../../src/app/content/PageContainer.mjs';
import PagingToolbar         from '../../../../../src/toolbar/Paging.mjs';
import Panel                 from '../../../../../src/container/Panel.mjs';
import PickerField           from '../../../../../src/form/field/Picker.mjs';
import Progress              from '../../../../../src/component/Progress.mjs';
import RangeField            from '../../../../../src/form/field/Range.mjs';
import Scheduler             from '../../../../../src/scheduler/Container.mjs';
import SearchField           from '../../../../../src/form/field/Search.mjs';
import SectionsList          from '../../../../../src/app/content/SectionsList.mjs';
import SegmentedButton       from '../../../../../src/button/Segmented.mjs';
import SelectField           from '../../../../../src/form/field/Select.mjs';
import Sitemap               from '../../../../../src/sitemap/Component.mjs';
import SplitButton           from '../../../../../src/button/Split.mjs';
import Splitter              from '../../../../../src/component/Splitter.mjs';
import StatusBadge           from '../../../../../src/component/StatusBadge.mjs';
import Store                 from '../../../../../src/data/Store.mjs';
import SwitchField           from '../../../../../src/form/field/Switch.mjs';
import TabContainer          from '../../../../../src/tab/Container.mjs';
import TableContainer        from '../../../../../src/table/Container.mjs';
import Taskbar               from '../../../../../src/desktop/Taskbar.mjs';
import TasksStore            from '../../../../../src/desktop/store/Tasks.mjs';
import TextArea              from '../../../../../src/form/field/TextArea.mjs';
import TextField             from '../../../../../src/form/field/Text.mjs';
import ThemeSwitcher         from '../../../../../src/button/ThemeSwitcher.mjs';
import Toolbar               from '../../../../../src/toolbar/Base.mjs';
import TreeList              from '../../../../../src/tree/List.mjs';
import ValuePicker           from '../../../../../src/list/ValuePicker.mjs';
import Viewport              from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Wraps a representative component blueprint inside an isolated, layout-contained stage cell.
 * @param {String} cellId Cell identifier matching `COMPONENT_MATRIX`.
 * @param {Object} item Child component config.
 * @returns {Object} Container blueprint.
 */
const cell = (cellId, item) => ({
    module: Container,
    id    : `eq-cell-${cellId}`,
    cls   : ['neo-eq-cell'],
    items : [item]
});

const listData = [
    {id: 'item-1', name: 'First item'},
    {id: 'item-2', name: 'Second item'}
];

void CubeLayout;

/**
 * @summary Boots the deterministic component stage used by `buildScripts/util/theme-equality.mjs`.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const app = Neo.app({
        name    : 'Test.Playwright.ThemeEquality',
        mainView: {
            module: Viewport,
            id    : 'theme-equality-viewport',
            cls   : ['neo-eq-stage-grid'],
            layout: {ntype: 'base'},
            items : [
                // app
                cell('app-content', {
                    module       : Container,
                    cls          : ['neo-app-content-container'],
                    width        : 360,
                    height       : 120,
                    stateProvider: {
                        data  : {
                            countSections     : 0,
                            nextPageRecord    : {id: 'n1', name: 'Next'},
                            previousPageRecord: {id: 'p1', name: 'Previous'}
                        },
                        stores: {
                            sections: {
                                module: Store,
                                model : {fields: [{name: 'id'}, {name: 'name'}, {name: 'tag'}]},
                                data  : [{id: 's1', name: 'Overview', tag: 'h2'}, {id: 's2', name: 'Details', tag: 'h3'}]
                            }
                        }
                    },
                    items        : [
                        {module: PageContainer},
                        {module: SectionsList}
                    ]
                }),

                // board
                cell('board', {
                    module : Board,
                    width  : 380,
                    height : 160,
                    columns: [{status: 'todo', title: 'To do'}, {status: 'done', title: 'Done'}],
                    store  : {
                        module     : Store,
                        keyProperty: 'id',
                        model      : CardModel,
                        data       : [
                            {id: 'c1', title: 'Card one', status: 'todo', order: 1000},
                            {id: 'c2', title: 'Card two', status: 'done', order: 1000}
                        ]
                    }
                }),

                // button
                cell('button-default',   {module: Button, text: 'Action', iconCls: 'fa fa-bolt', badgeText: '3'}),
                cell('button-primary',   {module: Button, ui: 'primary', text: 'Primary', iconCls: 'fa fa-check', badgeText: '1'}),
                cell('button-secondary', {module: Button, ui: 'secondary', text: 'Secondary', iconCls: 'fa fa-layer-group', badgeText: '2'}),
                cell('button-ghost',     {module: Button, ui: 'ghost', text: 'Ghost', iconCls: 'fa fa-star'}),
                cell('button-tertiary',  {module: Button, ui: 'tertiary', text: 'Tertiary', iconCls: 'fa fa-link'}),
                cell('button-small',     {module: Button, size: 'small', text: 'Small'}),
                cell('button-large',     {module: Button, size: 'large', text: 'Large'}),
                cell('segmented-button', {
                    module : SegmentedButton,
                    value  : 'day',
                    choices: [{text: 'Day', value: 'day'}, {text: 'Week', value: 'week'}]
                }),
                cell('split-button',     {module: SplitButton, text: 'Split'}),
                cell('theme-switcher',   {module: ThemeSwitcher}),

                // calendar
                cell('calendar', {
                    module             : Calendar,
                    width              : 400,
                    height             : 220,
                    calendarStoreConfig: {
                        autoLoad: false,
                        data    : [{id: 1, active: true, color: 'blue', name: 'Engineering'}]
                    },
                    eventStoreConfig   : {
                        autoLoad: false,
                        data    : []
                    },
                    modelData          : {
                        currentDate: new Date(Date.UTC(2024, 6, 21, 12, 0, 0))
                    }
                }),

                // code (LivePreview container shell + TabContainer without external Monaco worker)
                cell('live-preview', {
                    module: Container,
                    cls   : ['neo-code-live-preview'],
                    width : 360,
                    height: 140,
                    items : [{
                        module: Container,
                        cls   : ['live-preview-container'],
                        items : [{
                            module: TabContainer,
                            height: 120,
                            items : [{module: Component, header: {text: 'Preview'}, text: 'Output'}]
                        }]
                    }]
                }),

                // component
                cell('box-label',            {module: BoxLabel, text: 'Box label'}),
                cell('carousel', {
                    module : Carousel,
                    width  : 280,
                    height : 140,
                    itemTpl: data => [{text: data.name}],
                    store  : {
                        module: Store,
                        model : {fields: [{name: 'id'}, {name: 'name'}]},
                        data  : [
                            {id: 'c1', name: 'Slide 1'},
                            {id: 'c2', name: 'Slide 2'},
                            {id: 'c3', name: 'Slide 3'}
                        ]
                    }
                }),
                cell('chip',                 {module: Chip, text: 'Tag', closable: true}),
                cell('clock',                {module: Clock, showDisc: true, time: '10:10'}),
                cell('date-selector',        {module: DateSelector, value: '2024-07-21', width: 280, height: 220}),
                cell('empty-state',          {module: EmptyState, text: 'No results', description: 'Adjust filters', actionText: 'Reset'}),
                cell('empty-state-plain',    {module: EmptyState, ui: 'plain', text: 'Nothing queued'}),
                cell('icon',                 {module: Icon, cls: ['neo-icon', 'fa', 'fa-cube']}),
                cell('label',                {module: Label, text: 'Label'}),
                cell('markdown',             {module: Markdown, value: '### Heading\n\n> Quote\n\nInline `code` and [link](#).'}),
                cell('progress',             {module: Progress, value: 50, width: 200}),
                cell('splitter',             {module: Splitter, width: 8, height: 48}),
                cell('status-badge-neutral', {module: StatusBadge, state: 'neutral', labelNeutral: 'Idle'}),
                cell('status-badge-info',    {module: StatusBadge, state: 'info', labelInfo: 'Syncing'}),
                cell('status-badge-success', {module: StatusBadge, state: 'success', labelSuccess: 'Ready'}),
                cell('status-badge-alert',   {module: StatusBadge, state: 'alert', labelAlert: 'Degraded'}),
                cell('status-badge-error',   {module: StatusBadge, state: 'error', labelError: 'Failed'}),
                cell('toast', {
                    module: Component,
                    cls   : ['neo-toast'],
                    vdom  : {
                        cls: ['neo-toast'],
                        cn : [{cls: ['neo-toast-inner'], cn: [{cls: ['neo-toast-text'], text: 'Saved'}]}]
                    }
                }),

                // container
                cell('container', {module: Container, width: 200, height: 40, html: 'Container'}),
                cell('panel', {
                    module : Panel,
                    width  : 240,
                    height : 90,
                    headers: [{dock: 'top', text: 'Panel Header'}],
                    items  : [{module: Component, text: 'Panel body'}]
                }),
                cell('accordion', {
                    module: Accordion,
                    width : 240,
                    items : [
                        {module: AccordionItem, title: 'First', expanded: true, items: [{module: Component, text: 'Body'}]},
                        {module: AccordionItem, title: 'Second', expanded: false, items: [{module: Component, text: 'Hidden'}]}
                    ]
                }),

                // dashboard
                cell('dashboard', {
                    module: Dashboard,
                    width : 280,
                    height: 90,
                    items : [{module: DashboardPanel, headers: [{dock: 'top', text: 'Pane'}], items: [{module: Component, text: 'Tile'}]}]
                }),

                // date
                cell('date-selector-container', {module: DateSelectorContainer, value: '2024-07-21', width: 280, height: 220}),

                // desktop
                cell('desktop-taskbar', {
                    module   : Taskbar,
                    width    : 360,
                    taskStore: {
                        module: TasksStore,
                        data  : [{appId: 'notes', id: 'notes', iconCls: 'fa fa-file', title: 'Notes'}]
                    }
                }),

                // dialog (inline DOM shell so modal mask does not cover sibling stage cells, with header & footer action buttons)
                cell('dialog', {
                    module : Panel,
                    cls    : ['neo-dialog', 'neo-panel', 'neo-container'],
                    width  : 280,
                    height : 130,
                    headers: [
                        {
                            dock : 'top',
                            cls  : ['neo-header-toolbar'],
                            items: [
                                {module: Label, cls: ['neo-panel-header-text'], text: 'Dialog'},
                                '->',
                                {module: Button, iconCls: 'fa fa-xmark', ui: 'ghost'}
                            ]
                        },
                        {
                            dock : 'bottom',
                            cls  : ['neo-footer-toolbar'],
                            items: [{module: Button, text: 'Close'}]
                        }
                    ],
                    items  : [{module: Component, text: 'Dialog content'}]
                }),

                // filter
                cell('filter-boolean', {module: BooleanContainer, value: true, width: 240}),
                cell('filter-number',  {module: NumberContainer, value: 10, width: 240}),

                // form
                cell('form-container', {
                    module: FormContainer,
                    width : 260,
                    items : [{module: TextField, labelText: 'Form field', value: 'Seed'}]
                }),
                cell('fieldset', {
                    module     : Fieldset,
                    title      : 'Details',
                    collapsible: true,
                    width      : 260,
                    items      : [{module: Component, text: 'Fieldset body'}]
                }),
                cell('textfield', {
                    module       : TextField,
                    width        : 260,
                    labelPosition: 'top',
                    labelText    : 'Name',
                    subLabelText : 'Hint',
                    value        : 'Neo',
                    clearable    : true
                }),
                cell('textfield-inline', {
                    module       : TextField,
                    width        : 260,
                    labelPosition: 'inline',
                    labelText    : 'Inline',
                    value        : 'Neo'
                }),
                cell('textarea', {
                    module   : TextArea,
                    width    : 260,
                    labelText: 'Notes',
                    value    : 'Line'
                }),
                cell('numberfield', {
                    module   : NumberField,
                    width    : 240,
                    labelText: 'Count',
                    value    : 5
                }),
                cell('searchfield', {
                    module         : SearchField,
                    width          : 240,
                    placeholderText: 'Search'
                }),
                cell('selectfield', {
                    module   : SelectField,
                    width    : 260,
                    labelText: 'Role',
                    store    : {
                        module: Store,
                        model : {fields: [{name: 'id'}, {name: 'name'}]},
                        data  : listData
                    },
                    value    : 'item-1'
                }),
                cell('combobox', {
                    module   : ComboBox,
                    width    : 260,
                    labelText: 'Combo',
                    store    : {
                        module: Store,
                        model : {fields: [{name: 'id'}, {name: 'name'}]},
                        data  : listData
                    }
                }),
                cell('pickerfield', {
                    module   : PickerField,
                    width    : 260,
                    labelText: 'Picker'
                }),
                cell('checkboxfield',         {module: CheckBox, valueLabel: 'Option', checked: false}),
                cell('checkboxfield-checked', {module: CheckBox, valueLabel: 'Checked', checked: true}),
                cell('switchfield',           {module: SwitchField, valueLabel: 'Off', checked: false}),
                cell('switchfield-checked',   {module: SwitchField, valueLabel: 'On', checked: true}),
                cell('rangefield',            {module: RangeField, width: 240, labelText: 'Range', value: 40}),
                cell('fileuploadfield',       {module: FileUpload, width: 260, labelText: 'Upload'}),
                cell('chipfield',             {module: ChipField, width: 260, labelText: 'Tags'}),

                // gantt
                cell('gantt', {
                    module   : Gantt,
                    width    : 400,
                    height   : 150,
                    startDate: '2024-07-21T08:00:00Z',
                    endDate  : '2024-07-23T20:00:00Z',
                    columns  : [{dataField: 'name', text: 'Task', width: 120}],
                    store    : {
                        data: [{
                            id       : 't1',
                            parentId : null,
                            isLeaf   : true,
                            name     : 'Spec',
                            startDate: '2024-07-21T09:00:00Z',
                            endDate  : '2024-07-22T17:00:00Z'
                        }]
                    }
                }),

                // grid
                cell('grid', {
                    module : GridContainer,
                    width  : 380,
                    height : 150,
                    columns: [
                        {dataField: 'name', text: 'Name', width: 160},
                        {dataField: 'progress', text: 'Progress', type: 'progress', width: 140}
                    ],
                    footerToolbar: {module: Toolbar, cls: ['neo-grid-footer-toolbar'], items: [{module: Label, text: '2 rows'}]},
                    store        : {
                        module     : Store,
                        keyProperty: 'id',
                        model      : {fields: [{name: 'id'}, {name: 'name'}, {name: 'progress'}]},
                        data       : [
                            {id: 'r1', name: 'Row one', progress: 40},
                            {id: 'r2', name: 'Row two', progress: 80}
                        ]
                    }
                }),

                // layout
                cell('layout-cube', {
                    module: Container,
                    width : 120,
                    height: 120,
                    layout: {ntype: 'cube'},
                    items : [
                        {module: Component, text: 'Front'},
                        {module: Component, text: 'Right'},
                        {module: Component, text: 'Back'},
                        {module: Component, text: 'Left'},
                        {module: Component, text: 'Top'},
                        {module: Component, text: 'Bottom'}
                    ]
                }),

                // list
                cell('list', {
                    module        : List,
                    width         : 220,
                    height        : 90,
                    useCheckBoxes : true,
                    useWrapperNode: true,
                    store         : {
                        module: Store,
                        model : {fields: [{name: 'id'}, {name: 'name'}]},
                        data  : listData
                    }
                }),
                cell('chip-list', {
                    module: ChipList,
                    width : 240,
                    store : {
                        module: Store,
                        model : {fields: [{name: 'id'}, {name: 'name'}]},
                        data  : listData
                    }
                }),
                cell('value-picker', {
                    module: ValuePicker,
                    width : 220,
                    height: 90,
                    store : {
                        module     : Store,
                        keyProperty: 'key',
                        model      : {keyProperty: 'key', fields: [{name: 'key'}, {name: 'value'}, {name: 'label'}, {name: 'count'}]},
                        data       : [
                            {key: 'v1', value: 'v1', label: 'Alpha', count: 4},
                            {key: 'v2', value: 'v2', label: 'Beta', count: 2}
                        ]
                    }
                }),

                // menu
                cell('menu-list', {
                    module: MenuList,
                    width : 200,
                    items : [{id: 'm1', text: 'Open'}, {id: 'm2', text: 'Close'}]
                }),

                // plugin
                cell('plugin-resizable', {
                    module: Component,
                    vdom  : {
                        cn: [
                            {cls: ['neo-resizable', 'neo-resizable-bottom'], style: {width: '120px', height: '32px'}},
                            {cls: ['neo-popover'], style: {width: '120px', height: '32px'}, text: 'Popover'}
                        ]
                    }
                }),

                // scheduler
                cell('scheduler', {
                    module         : Scheduler,
                    width          : 400,
                    height         : 150,
                    startDate      : '2024-07-21T08:00:00Z',
                    endDate        : '2024-07-22T20:00:00Z',
                    resourceColumns: [{dataField: 'name', text: 'Owner', width: 110}],
                    store          : {
                        module     : Store,
                        keyProperty: 'id',
                        model      : {fields: [{name: 'id'}, {name: 'name'}]},
                        data       : [{id: 'res-1', name: 'Ada'}]
                    },
                    eventStore     : {
                        data: [{
                            id        : 'ev-1',
                            resourceId: 'res-1',
                            title     : 'Review',
                            startDate : '2024-07-21T09:00:00Z',
                            endDate   : '2024-07-21T15:00:00Z'
                        }]
                    }
                }),

                // sitemap
                cell('sitemap', {
                    module: Sitemap,
                    width : 240,
                    store : {
                        data: [
                            {id: 'sm-1', parentId: null, name: 'Guides', level: 0},
                            {id: 'sm-2', parentId: 'sm-1', name: 'Theming', level: 1, action: '/theming', actionType: 'link'}
                        ]
                    }
                }),

                // tab
                cell('tab-container', {
                    module: TabContainer,
                    width : 280,
                    height: 110,
                    items : [
                        {module: Component, header: {iconCls: 'fa fa-folder', text: 'First'}, text: 'Tab 1'},
                        {module: Component, header: {iconCls: 'fa fa-file', text: 'Second'}, text: 'Tab 2'}
                    ]
                }),
                cell('tab-container-inline', {
                    module: TabContainer,
                    cls   : ['neo-tab-container-inline'],
                    width : 280,
                    height: 110,
                    items : [
                        {module: Component, header: {iconCls: 'fa fa-folder', text: 'Inline A'}, text: 'Body A'},
                        {module: Component, header: {iconCls: 'fa fa-file', text: 'Inline B'}, text: 'Body B'}
                    ]
                }),
                cell('tab-container-standalone', {
                    module: TabContainer,
                    cls   : ['neo-tab-container-standalone'],
                    width : 280,
                    height: 110,
                    items : [
                        {module: Component, header: {iconCls: 'fa fa-folder', text: 'Standalone A'}, text: 'Body A'},
                        {module: Component, header: {iconCls: 'fa fa-file', text: 'Standalone B'}, text: 'Body B'}
                    ]
                }),

                // table
                cell('table', {
                    module : TableContainer,
                    width  : 320,
                    height : 120,
                    columns: [
                        {dataField: 'name', text: 'Name'},
                        {dataField: 'role', text: 'Role'}
                    ],
                    store  : {
                        module     : Store,
                        keyProperty: 'id',
                        model      : {fields: [{name: 'id'}, {name: 'name'}, {name: 'role'}]},
                        data       : [
                            {id: 't1', name: 'Julia', role: 'Engine'},
                            {id: 't2', name: 'Grace', role: 'Review'}
                        ]
                    }
                }),

                // timeline
                cell('timeline', {
                    module: Component,
                    vdom  : {
                        cn: [
                            {cls: ['neo-timeline-event-editor'], style: {padding: '8px'}, text: 'Event editor'},
                            {
                                cls: ['neo-grid-body'],
                                cn : [{
                                    cls: ['neo-grid-row'],
                                    cn : [{
                                        cls: ['neo-grid-cell', 'neo-timeline-cell'],
                                        cn : [{cls: ['neo-timeline-bar'], text: 'Task'}]
                                    }]
                                }]
                            }
                        ]
                    }
                }),

                // toolbar
                cell('toolbar', {
                    module: Toolbar,
                    width : 260,
                    items : [{text: 'Tool'}]
                }),
                cell('breadcrumb', {
                    module   : Breadcrumb,
                    activeKey: 'leaf',
                    store    : {
                        module     : Store,
                        keyProperty: 'id',
                        model      : {fields: [{name: 'id'}, {name: 'parentId'}, {name: 'name'}, {name: 'route'}]},
                        data       : [
                            {id: 'root', parentId: null, name: 'Home', route: '/'},
                            {id: 'leaf', parentId: 'root', name: 'Themes', route: '/themes'}
                        ]
                    }
                }),
                cell('paging-toolbar', {
                    module: PagingToolbar,
                    width : 340
                }),

                // tooltip
                cell('tooltip', {
                    module: Component,
                    cls   : ['neo-tooltip'],
                    text  : 'Tooltip preview'
                }),

                // tree
                cell('tree-list', {
                    module: TreeList,
                    width : 220,
                    height: 100,
                    store : {
                        module     : Store,
                        keyProperty: 'id',
                        model      : {fields: [{name: 'id'}, {name: 'parentId'}, {name: 'isLeaf'}, {name: 'collapsed'}, {name: 'name'}]},
                        data       : [
                            {id: 'folder-1', parentId: null, isLeaf: false, collapsed: false, name: 'Components'},
                            {id: 'leaf-1', parentId: 'folder-1', isLeaf: true, name: 'Button'}
                        ]
                    }
                }),

                // util (HighlightJs static token markup)
                cell('highlightjs', {
                    module : Component,
                    baseCls: ['hljs'],
                    vdom   : {
                        tag: 'pre',
                        cn : [{
                            tag: 'code',
                            cn : [
                                {tag: 'span', cls: ['hljs-keyword'], text: 'const'},
                                {tag: 'span', text: ' count = '},
                                {tag: 'span', cls: ['hljs-number'], text: '42'},
                                {tag: 'span', text: '; '},
                                {tag: 'span', cls: ['hljs-comment'], text: '// comment'},
                                {
                                    tag: 'table',
                                    cls: ['hljs-ln'],
                                    cn : [{
                                        tag: 'tr',
                                        cn : [
                                            {tag: 'td', cls: ['hljs-ln-numbers'], text: '1'},
                                            {tag: 'td', cls: ['hljs-ln-code'], text: 'const count = 42;'}
                                        ]
                                    }]
                                }
                            ]
                        }]
                    }
                })
            ]
        }
    });

    const markReady = () => {
        const vp = Neo.getComponent('theme-equality-viewport');

        if (vp?.mounted && !vp.isVdomUpdating) {
            vp.vdom['data-ready'] = 'true';
            vp.update()
        } else {
            setTimeout(markReady, 50)
        }
    };

    setTimeout(markReady, 100);

    return app
};
