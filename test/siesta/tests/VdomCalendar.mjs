import Neo        from '../../../src/Neo.mjs';
import * as core  from '../../../src/core/_export.mjs';
import NeoArray   from '../../../src/util/Array.mjs';
import Style      from '../../../src/util/Style.mjs';
import VdomHelper from '../../../src/vdom/Helper.mjs';
import VDomUtil   from '../../../src/util/VDom.mjs';

let deltas, output, vdom, vnode;

StartTest(t => {
    t.it('Drag an event to the top inside the same column', t => {
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]},
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time',  html: '10:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time',  html: '06:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]},
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-1'},
            {innerHTML: '06:00', id: 'neo-event-2__time'}
        ], 'deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-1', cn: [
                    {id: 'neo-event-1__time',  html: '08:00'},
                    {id: 'neo-event-1__title', html: 'Event 1'}
                ]},
                {id: 'neo-event-2', cn: [
                    {id: 'neo-event-2__time',  html: '10:00'},
                    {id: 'neo-event-2__title', html: 'Event 2'}
                ]}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {innerHTML: '10:00', id: 'neo-event-2__time'}
        ], 'deltas got created successfully');
    });

    t.it('Event moving to the right', t => {
        t.diag('Insert event into a column on the right');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event']}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: []},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-1', cls: ['neo-event', 'foo']},
                {id: 'neo-event-2', cls: ['neo-event']}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 2, 'Count deltas equals 2');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-2'},
            {cls: {add: ['foo'], remove: []}, id: 'neo-event-1'}
        ], 'deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-1', cls: ['neo-event']}]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn : [{id: 'neo-event-2', cls: ['neo-event']}]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'},
            {cls: {add: [], remove: ['foo']}, id: 'neo-event-1'},
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-2'} // todo: does not hurt, but not needed
        ], 'deltas got created successfully');
    });

    t.it('Event moving to the left', t => {
        t.diag('Insert event into a column on the left');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event']}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event', 'foo']},
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: []}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 2, 'Count deltas equals 2');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-1'},
            {cls: {add: ['foo'], remove: []}, id: 'neo-event-2'}
        ], 'deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event']}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'}, // todo: does not hurt, but not needed
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-2'},
            {cls: {add: [], remove: ['foo']}, id: 'neo-event-2'}
        ], 'deltas got created successfully');
    });

    t.it('removeDom vdom property', t => {
        t.diag('Remove the DOM of the first child node');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', removeDom: true},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-column-1', parentId: 'neo-calendar-week'}
        ], 'deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-column-1', index:0, outerHTML: '<div id="neo-column-1"></div>', parentId: 'neo-calendar-week'}
        ], 'deltas got created successfully');

        t.diag('Remove the DOM of the last child node');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3', removeDom: true}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-column-3', parentId: 'neo-calendar-week'}
        ], 'deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1'},
            {id: 'neo-column-2'},
            {id: 'neo-column-3'}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-column-3', index:2, outerHTML: '<div id="neo-column-3"></div>', parentId: 'neo-calendar-week'}
        ], 'deltas got created successfully');

        t.diag('Remove a top level node');

        vdom =
        {id: 'neo-1'};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-1', removeDom: true};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-1'}
        ], 'deltas got created successfully');

        // see: https://github.com/neomjs/neo/issues/2390
        t.diag('Move an event with a higher index sibling into a non empty column');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-1'}
            ]},
            {id: 'neo-column-2', cn: [
                {id: 'neo-event-2'},
                {id: 'neo-event-3'}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cn: [
                {id: 'neo-event-1'},
                {id: 'neo-event-2'}
            ]},
            {id: 'neo-column-2', cn: [
                {id: 'neo-event-3'}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-2', index: 1, parentId: 'neo-column-1'},
            {action: 'moveNode', id: 'neo-event-3', index: 0, parentId: 'neo-column-2'}  // todo: does not hurt, but not needed
        ], 'deltas got created successfully');

        t.diag('Remove the first item inside the calendars list');

        vdom =
        {tag: 'ul', id: 'neo-calendar-calendars-list-1', cn: [
            {tag: 'li', id: 'neo-calendar-calendars-list-1__1', cn: [
                {id: 'neo-calendar-calendars-list-1__component__1', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__1-label'},
                    {id : 'neo-calendar-calendars-list-1__component__1-input'}
                ]}
            ]},
            {tag: 'li', id: 'neo-calendar-calendars-list-1__2', cn: [
                {id: 'neo-calendar-calendars-list-1__component__2', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__2-label'},
                    {id : 'neo-calendar-calendars-list-1__component__2-input'}
                ]}
            ]},
            {tag: 'li', id: 'neo-calendar-calendars-list-1__3', cn: [
                {id: 'neo-calendar-calendars-list-1__component__3', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__3-label'},
                    {id : 'neo-calendar-calendars-list-1__component__3-input'}
                ]}
            ]}
        ]};

        vnode = VdomHelper.create(vdom);

        vdom =
        {tag: 'ul', id: 'neo-calendar-calendars-list-1', cn: [
            {tag: 'li', id: 'neo-calendar-calendars-list-1__2', cn: [
                {id: 'neo-calendar-calendars-list-1__component__2', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__2-label'},
                    {id : 'neo-calendar-calendars-list-1__component__2-input'}
                ]}
            ]},
            {tag: 'li', id: 'neo-calendar-calendars-list-1__3', cn: [
                {id: 'neo-calendar-calendars-list-1__component__3', cn: [
                    {tag: 'label', id: 'neo-calendar-calendars-list-1__component__3-label'},
                    {id : 'neo-calendar-calendars-list-1__component__3-input'}
                ]}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-calendar-calendars-list-1__1', parentId: 'neo-calendar-calendars-list-1'}
        ], 'deltas got created successfully');
    });

    t.it('Month View infinite scrolling', t => {
        vdom =
        {cls: ['neo-c-m-scrollcontainer', 'neo-scroll-shadows', 'neo-is-scrolling'], id: 'neo-vnode-150', cn: [
            {id: 'neo-component-6__week__2021-02-21', flag: '2021-02-21', cls: ['neo-week'], cn: [
                {cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-02-21', cn: [
                    {cls: ['neo-day-number'], html: 21, id: 'neo-component-6__day_number__2021-02-21'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-02-22', cn: [
                    {cls: ['neo-day-number'], html: 22, id: 'neo-component-6__day_number__2021-02-22'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-02-23', cn: [
                    {cls: ['neo-day-number'], html: 23, id: 'neo-component-6__day_number__2021-02-23'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-02-24', cn: [
                    {cls: ['neo-day-number'], html: 24, id: 'neo-component-6__day_number__2021-02-24'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-02-25', cn: [
                    {cls: ['neo-day-number'], html: 25, id: 'neo-component-6__day_number__2021-02-25'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-02-26', cn: [
                    {cls: ['neo-day-number'], html: 26, id: 'neo-component-6__day_number__2021-02-26'}
                ]},
                {cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-02-27', cn: [
                    {cls: ['neo-day-number'], html: 27, id: 'neo-component-6__day_number__2021-02-27'}
                ]}
            ]},
            {tag: 'div', id: 'neo-vnode-168', 'cls': ['neo-month-header'], 'cn': [
                {tag: 'div', id: 'neo-vnode-167', 'cls': ['neo-month-header-content'], 'cn': [
                    {tag: 'span', cls: ['neo-month-name'], flag: 'month-name', html: 'Mar', id: 'neo-vnode-166'},
                    {vtype: 'text', id: 'neo-vtext-7', html: ' 2021'}
                ]}
            ]},
            {tag : 'div', id: 'neo-component-6__week__2021-02-28', flag: '2021-03-01', cls: ['neo-week'], cn: [
                {tag: 'div', cls: ['neo-day', 'neo-weekend'], id : 'neo-component-6__day__2021-02-28', cn: [
                    {cls : ['neo-day-number'], html: 28, id: 'neo-component-6__day_number__2021-02-28', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-01', cn: [
                    {cls : ['neo-day-number'], html: 1, id: 'neo-component-6__day_number__2021-03-01', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-02', cn: [
                    {cls : ['neo-day-number'], html: 2, id: 'neo-component-6__day_number__2021-03-02', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-03', cn: [
                    {cls : ['neo-day-number'], html: 3, id: 'neo-component-6__day_number__2021-03-03', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-04', cn: [
                    {cls : ['neo-day-number'], html: 4, id: 'neo-component-6__day_number__2021-03-04', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-05', cn: [
                    {cls : ['neo-day-number'], html: 5, id: 'neo-component-6__day_number__2021-03-05', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-03-06', cn: [
                    {cls : ['neo-day-number'], html: 6, id: 'neo-component-6__day_number__2021-03-06', tag: 'div'}
                ]}
            ]},
            {tag: 'div', id: 'neo-component-6__week__2021-03-07', flag: '2021-03-07', cls: ['neo-week'], cn: [
                {tag: 'div', cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-03-07', cn: [
                    {cls: ['neo-day-number'], html: 7, id: 'neo-component-6__day_number__2021-03-07', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-08', cn: [
                    {cls: ['neo-day-number'], html: 8, id: 'neo-component-6__day_number__2021-03-08', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-09', cn: [
                    {cls: ['neo-day-number'], html: 9, id: 'neo-component-6__day_number__2021-03-09', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-10', cn: [
                    {cls: ['neo-day-number'], html: 10, id: 'neo-component-6__day_number__2021-03-10', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-11', cn: [
                    {cls: ['neo-day-number'], html: 11, id: 'neo-component-6__day_number__2021-03-11', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day'], id: 'neo-component-6__day__2021-03-12', cn: [
                    {cls: ['neo-day-number'], html: 12, id: 'neo-component-6__day_number__2021-03-12', tag: 'div'}
                ]},
                {tag: 'div', cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-03-13', cn: [
                    {cls: ['neo-day-number'], html: 13, id: 'neo-component-6__day_number__2021-03-13', tag: 'div'}
                ]}
            ]}, {
                flag: '2021-03-14',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-03-14',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 14,
                        id  : 'neo-component-6__day_number__2021-03-14',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-15',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 15,
                        id  : 'neo-component-6__day_number__2021-03-15',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-16',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 16,
                        id  : 'neo-component-6__day_number__2021-03-16',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-17',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 17,
                        id  : 'neo-component-6__day_number__2021-03-17',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-18',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 18,
                        id  : 'neo-component-6__day_number__2021-03-18',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-19',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 19,
                        id  : 'neo-component-6__day_number__2021-03-19',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-03-20',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 20,
                        id  : 'neo-component-6__day_number__2021-03-20',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-03-14',
                tag : 'div'
            }, {
                flag: '2021-03-21',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-03-21',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 21,
                        id  : 'neo-component-6__day_number__2021-03-21',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-22',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 22,
                        id  : 'neo-component-6__day_number__2021-03-22',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-23',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 23,
                        id  : 'neo-component-6__day_number__2021-03-23',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-24',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 24,
                        id  : 'neo-component-6__day_number__2021-03-24',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-25',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 25,
                        id  : 'neo-component-6__day_number__2021-03-25',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-26',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 26,
                        id  : 'neo-component-6__day_number__2021-03-26',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-03-27',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 27,
                        id  : 'neo-component-6__day_number__2021-03-27',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-03-21',
                tag : 'div'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    cls: ['neo-month-header-content'],
                    cn : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name',
                        html: 'Apr',
                        id  : 'neo-vnode-169'
                    }, {vtype: 'text', id: 'neo-vtext-8', html: ' 2021'}],
                    id : 'neo-vnode-170',
                    tag: 'div'
                }],
                id : 'neo-vnode-171',
                tag: 'div'
            }, {
                flag: '2021-04-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-03-28',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 28,
                        id  : 'neo-component-6__day_number__2021-03-28',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-29',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 29,
                        id  : 'neo-component-6__day_number__2021-03-29',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-30',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 30,
                        id  : 'neo-component-6__day_number__2021-03-30',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-03-31',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 31,
                        id  : 'neo-component-6__day_number__2021-03-31',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-01',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 1,
                        id  : 'neo-component-6__day_number__2021-04-01',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-02',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 2,
                        id  : 'neo-component-6__day_number__2021-04-02',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-03',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 3,
                        id  : 'neo-component-6__day_number__2021-04-03',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-03-28',
                tag : 'div'
            }, {
                flag: '2021-04-04',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-04',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 4,
                        id  : 'neo-component-6__day_number__2021-04-04',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-05',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 5,
                        id  : 'neo-component-6__day_number__2021-04-05',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-06',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 6,
                        id  : 'neo-component-6__day_number__2021-04-06',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-07',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 7,
                        id  : 'neo-component-6__day_number__2021-04-07',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-08',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 8,
                        id  : 'neo-component-6__day_number__2021-04-08',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-09',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 9,
                        id  : 'neo-component-6__day_number__2021-04-09',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-10',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 10,
                        id  : 'neo-component-6__day_number__2021-04-10',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-04-04',
                tag : 'div'
            }, {
                flag: '2021-04-11',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-11',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 11,
                        id  : 'neo-component-6__day_number__2021-04-11',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-12',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 12,
                        id  : 'neo-component-6__day_number__2021-04-12',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-13',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 13,
                        id  : 'neo-component-6__day_number__2021-04-13',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-14',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 14,
                        id  : 'neo-component-6__day_number__2021-04-14',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-15',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 15,
                        id  : 'neo-component-6__day_number__2021-04-15',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-16',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 16,
                        id  : 'neo-component-6__day_number__2021-04-16',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-17',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 17,
                        id  : 'neo-component-6__day_number__2021-04-17',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-04-11',
                tag : 'div'
            }, {
                flag: '2021-04-18',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-18',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 18,
                        id  : 'neo-component-6__day_number__2021-04-18',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-19',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 19,
                        id  : 'neo-component-6__day_number__2021-04-19',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-20',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 20,
                        id  : 'neo-component-6__day_number__2021-04-20',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-21',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 21,
                        id  : 'neo-component-6__day_number__2021-04-21',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-22',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 22,
                        id  : 'neo-component-6__day_number__2021-04-22',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-23',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 23,
                        id  : 'neo-component-6__day_number__2021-04-23',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-24',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 24,
                        id  : 'neo-component-6__day_number__2021-04-24',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-04-18',
                tag : 'div'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    cls: ['neo-month-header-content'],
                    cn : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name',
                        html: 'May',
                        id  : 'neo-vnode-163'
                    }, {vtype: 'text', id: 'neo-vtext-6', html: ' 2021'}],
                    id : 'neo-vnode-164',
                    tag: 'div'
                }],
                id : 'neo-vnode-165',
                tag: 'div'
            }, {
                flag: '2021-05-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-25',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 25,
                        id  : 'neo-component-6__day_number__2021-04-25',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-26',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 26,
                        id  : 'neo-component-6__day_number__2021-04-26',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-27',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 27,
                        id  : 'neo-component-6__day_number__2021-04-27',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-28',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 28,
                        id  : 'neo-component-6__day_number__2021-04-28',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-29',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 29,
                        id  : 'neo-component-6__day_number__2021-04-29',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-30',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 30,
                        id  : 'neo-component-6__day_number__2021-04-30',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-01',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 1,
                        id  : 'neo-component-6__day_number__2021-05-01',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-04-25',
                tag : 'div'
            }, {
                flag: '2021-05-02',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-02',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 2,
                        id  : 'neo-component-6__day_number__2021-05-02',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-03',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 3,
                        id  : 'neo-component-6__day_number__2021-05-03',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-04',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 4,
                        id  : 'neo-component-6__day_number__2021-05-04',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-05',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 5,
                        id  : 'neo-component-6__day_number__2021-05-05',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-06',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 6,
                        id  : 'neo-component-6__day_number__2021-05-06',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-07',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 7,
                        id  : 'neo-component-6__day_number__2021-05-07',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-08',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 8,
                        id  : 'neo-component-6__day_number__2021-05-08',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-05-02',
                tag : 'div'
            }, {
                flag: '2021-05-09',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-09',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 9,
                        id  : 'neo-component-6__day_number__2021-05-09',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-10',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 10,
                        id  : 'neo-component-6__day_number__2021-05-10',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-11',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 11,
                        id  : 'neo-component-6__day_number__2021-05-11',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-12',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 12,
                        id  : 'neo-component-6__day_number__2021-05-12',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-13',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 13,
                        id  : 'neo-component-6__day_number__2021-05-13',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-14',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 14,
                        id  : 'neo-component-6__day_number__2021-05-14',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-15',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 15,
                        id  : 'neo-component-6__day_number__2021-05-15',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-05-09',
                tag : 'div'
            }, {
                flag: '2021-05-16',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-16',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 16,
                        id  : 'neo-component-6__day_number__2021-05-16',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-17',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 17,
                        id  : 'neo-component-6__day_number__2021-05-17',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-18',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 18,
                        id  : 'neo-component-6__day_number__2021-05-18',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-19',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 19,
                        id  : 'neo-component-6__day_number__2021-05-19',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-20',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 20,
                        id  : 'neo-component-6__day_number__2021-05-20',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-21',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 21,
                        id  : 'neo-component-6__day_number__2021-05-21',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-22',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 22,
                        id  : 'neo-component-6__day_number__2021-05-22',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-05-16',
                tag : 'div'
            }, {
                flag: '2021-05-23',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-23',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 23,
                        id  : 'neo-component-6__day_number__2021-05-23',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-24',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 24,
                        id  : 'neo-component-6__day_number__2021-05-24',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-25',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 25,
                        id  : 'neo-component-6__day_number__2021-05-25',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-26',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 26,
                        id  : 'neo-component-6__day_number__2021-05-26',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-27',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 27,
                        id  : 'neo-component-6__day_number__2021-05-27',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-28',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 28,
                        id  : 'neo-component-6__day_number__2021-05-28',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-29',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 29,
                        id  : 'neo-component-6__day_number__2021-05-29',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-05-23',
                tag : 'div'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    cls: ['neo-month-header-content'],
                    cn : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name',
                        html: 'Jun',
                        id  : 'neo-vnode-151'
                    }, {vtype: 'text', id: 'neo-vtext-2', html: ' 2021'}],
                    id : 'neo-vnode-152',
                    tag: 'div'
                }],
                id : 'neo-vnode-153',
                tag: 'div'
            }, {
                flag: '2021-06-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-30',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 30,
                        id  : 'neo-component-6__day_number__2021-05-30',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-31',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 31,
                        id  : 'neo-component-6__day_number__2021-05-31',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-01',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 1,
                        id  : 'neo-component-6__day_number__2021-06-01',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-02',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 2,
                        id  : 'neo-component-6__day_number__2021-06-02',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-03',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 3,
                        id  : 'neo-component-6__day_number__2021-06-03',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-04',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 4,
                        id  : 'neo-component-6__day_number__2021-06-04',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-05',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 5,
                        id  : 'neo-component-6__day_number__2021-06-05',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-05-30',
                tag : 'div'
            }, {
                flag: '2021-06-06',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-06',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 6,
                        id  : 'neo-component-6__day_number__2021-06-06',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-07',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 7,
                        id  : 'neo-component-6__day_number__2021-06-07',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-08',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 8,
                        id  : 'neo-component-6__day_number__2021-06-08',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-09',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 9,
                        id  : 'neo-component-6__day_number__2021-06-09',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-10',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 10,
                        id  : 'neo-component-6__day_number__2021-06-10',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-11',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 11,
                        id  : 'neo-component-6__day_number__2021-06-11',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-12',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 12,
                        id  : 'neo-component-6__day_number__2021-06-12',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-06-06',
                tag : 'div'
            }, {
                flag: '2021-06-13',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-13',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 13,
                        id  : 'neo-component-6__day_number__2021-06-13',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-14',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 14,
                        id  : 'neo-component-6__day_number__2021-06-14',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-15',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 15,
                        id  : 'neo-component-6__day_number__2021-06-15',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-16',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 16,
                        id  : 'neo-component-6__day_number__2021-06-16',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-17',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 17,
                        id  : 'neo-component-6__day_number__2021-06-17',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-18',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 18,
                        id  : 'neo-component-6__day_number__2021-06-18',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-19',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 19,
                        id  : 'neo-component-6__day_number__2021-06-19',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-06-13',
                tag : 'div'
            }, {
                flag: '2021-06-20',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-20',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 20,
                        id  : 'neo-component-6__day_number__2021-06-20',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-21',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 21,
                        id  : 'neo-component-6__day_number__2021-06-21',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-22',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 22,
                        id  : 'neo-component-6__day_number__2021-06-22',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-23',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 23,
                        id  : 'neo-component-6__day_number__2021-06-23',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-24',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 24,
                        id  : 'neo-component-6__day_number__2021-06-24',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-25',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 25,
                        id  : 'neo-component-6__day_number__2021-06-25',
                        tag : 'div'
                    }],
                    tag: 'div'
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-26',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 26,
                        id  : 'neo-component-6__day_number__2021-06-26',
                        tag : 'div'
                    }],
                    tag: 'div'
                }],
                id  : 'neo-component-6__week__2021-06-20',
                tag : 'div'
            }], tag: 'div'
        }

        vnode = VdomHelper.create(vdom);

        vdom =
        {cls: ['neo-c-m-scrollcontainer', 'neo-scroll-shadows', 'neo-is-scrolling'], id: 'neo-vnode-150', cn: [
            {id: 'neo-component-6__week__2021-04-04', flag: '2021-04-04', cls: ['neo-week'], cn: [
                {cls: ['neo-day', 'neo-weekend'], id : 'neo-component-6__day__2021-04-04', cn : [
                    {cls: ['neo-day-number'], html: 4, id: 'neo-component-6__day_number__2021-04-04'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-05', cn: [
                    {cls: ['neo-day-number'], html: 5, id: 'neo-component-6__day_number__2021-04-05'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-06', cn: [
                    {cls: ['neo-day-number'], html: 6, id: 'neo-component-6__day_number__2021-04-06'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-07', cn: [
                    {cls: ['neo-day-number'], html: 7, id: 'neo-component-6__day_number__2021-04-07'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-08', cn: [
                    {cls: ['neo-day-number'], html: 8, id: 'neo-component-6__day_number__2021-04-08'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-09', cn: [
                    {cls: ['neo-day-number'], html: 9, id: 'neo-component-6__day_number__2021-04-09'}
                ]},
                {cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-04-10', cn: [
                    {cls: ['neo-day-number'], html: 10, id: 'neo-component-6__day_number__2021-04-10'}
                ]}
            ]},
            {id: 'neo-component-6__week__2021-04-11', flag: '2021-04-11', cls: ['neo-week'], cn: [
                {cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-04-11', cn: [
                    {cls: ['neo-day-number'], html: 11, id: 'neo-component-6__day_number__2021-04-11'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-12', cn: [
                    {cls: ['neo-day-number'], html: 12, id: 'neo-component-6__day_number__2021-04-12'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-13', cn: [
                    {cls: ['neo-day-number'], html: 13, id: 'neo-component-6__day_number__2021-04-13'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-14', cn: [
                    {cls: ['neo-day-number'], html: 14, id: 'neo-component-6__day_number__2021-04-14'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-15', cn: [
                    {cls: ['neo-day-number'], html: 15, id: 'neo-component-6__day_number__2021-04-15'}
                ]},
                {cls: ['neo-day'], id: 'neo-component-6__day__2021-04-16', cn: [
                    {cls: ['neo-day-number'], html: 16, id: 'neo-component-6__day_number__2021-04-16'}
                ]},
                {cls: ['neo-day', 'neo-weekend'], id: 'neo-component-6__day__2021-04-17', cn: [
                    {cls: ['neo-day-number'], html: 17, id: 'neo-component-6__day_number__2021-04-17'}
                ]}
            ]},
            {
                flag: '2021-04-18',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-18',
                    cn : [{cls: ['neo-day-number'], html: 18, id: 'neo-component-6__day_number__2021-04-18'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-19',
                    cn : [{cls: ['neo-day-number'], html: 19, id: 'neo-component-6__day_number__2021-04-19'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-20',
                    cn : [{cls: ['neo-day-number'], html: 20, id: 'neo-component-6__day_number__2021-04-20'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-21',
                    cn : [{cls: ['neo-day-number'], html: 21, id: 'neo-component-6__day_number__2021-04-21'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-22',
                    cn : [{cls: ['neo-day-number'], html: 22, id: 'neo-component-6__day_number__2021-04-22'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-23',
                    cn : [{cls: ['neo-day-number'], html: 23, id: 'neo-component-6__day_number__2021-04-23'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-24',
                    cn : [{cls: ['neo-day-number'], html: 24, id: 'neo-component-6__day_number__2021-04-24'}]
                }],
                id  : 'neo-component-6__week__2021-04-18'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    cls: ['neo-month-header-content'],
                    cn : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name',
                        html: 'May',
                        id  : 'neo-vnode-163'
                    }, {vtype: 'text', html: ' 2021', id: 'neo-vtext-6'}],
                    id : 'neo-vnode-164'
                }],
                id : 'neo-vnode-165'
            }, {
                flag: '2021-05-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-04-25',
                    cn : [{cls: ['neo-day-number'], html: 25, id: 'neo-component-6__day_number__2021-04-25'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-26',
                    cn : [{cls: ['neo-day-number'], html: 26, id: 'neo-component-6__day_number__2021-04-26'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-27',
                    cn : [{cls: ['neo-day-number'], html: 27, id: 'neo-component-6__day_number__2021-04-27'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-28',
                    cn : [{cls: ['neo-day-number'], html: 28, id: 'neo-component-6__day_number__2021-04-28'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-29',
                    cn : [{cls: ['neo-day-number'], html: 29, id: 'neo-component-6__day_number__2021-04-29'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-04-30',
                    cn : [{cls: ['neo-day-number'], html: 30, id: 'neo-component-6__day_number__2021-04-30'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-01',
                    cn : [{cls: ['neo-day-number'], html: 1, id: 'neo-component-6__day_number__2021-05-01'}]
                }],
                id  : 'neo-component-6__week__2021-04-25'
            }, {
                flag: '2021-05-02',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-02',
                    cn : [{cls: ['neo-day-number'], html: 2, id: 'neo-component-6__day_number__2021-05-02'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-03',
                    cn : [{cls: ['neo-day-number'], html: 3, id: 'neo-component-6__day_number__2021-05-03'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-04',
                    cn : [{cls: ['neo-day-number'], html: 4, id: 'neo-component-6__day_number__2021-05-04'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-05',
                    cn : [{cls: ['neo-day-number'], html: 5, id: 'neo-component-6__day_number__2021-05-05'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-06',
                    cn : [{cls: ['neo-day-number'], html: 6, id: 'neo-component-6__day_number__2021-05-06'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-07',
                    cn : [{cls: ['neo-day-number'], html: 7, id: 'neo-component-6__day_number__2021-05-07'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-08',
                    cn : [{cls: ['neo-day-number'], html: 8, id: 'neo-component-6__day_number__2021-05-08'}]
                }],
                id  : 'neo-component-6__week__2021-05-02'
            }, {
                flag: '2021-05-09',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-09',
                    cn : [{cls: ['neo-day-number'], html: 9, id: 'neo-component-6__day_number__2021-05-09'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-10',
                    cn : [{cls: ['neo-day-number'], html: 10, id: 'neo-component-6__day_number__2021-05-10'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-11',
                    cn : [{cls: ['neo-day-number'], html: 11, id: 'neo-component-6__day_number__2021-05-11'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-12',
                    cn : [{cls: ['neo-day-number'], html: 12, id: 'neo-component-6__day_number__2021-05-12'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-13',
                    cn : [{cls: ['neo-day-number'], html: 13, id: 'neo-component-6__day_number__2021-05-13'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-14',
                    cn : [{cls: ['neo-day-number'], html: 14, id: 'neo-component-6__day_number__2021-05-14'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-15',
                    cn : [{cls: ['neo-day-number'], html: 15, id: 'neo-component-6__day_number__2021-05-15'}]
                }],
                id  : 'neo-component-6__week__2021-05-09'
            }, {
                flag: '2021-05-16',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-16',
                    cn : [{cls: ['neo-day-number'], html: 16, id: 'neo-component-6__day_number__2021-05-16'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-17',
                    cn : [{cls: ['neo-day-number'], html: 17, id: 'neo-component-6__day_number__2021-05-17'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-18',
                    cn : [{cls: ['neo-day-number'], html: 18, id: 'neo-component-6__day_number__2021-05-18'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-19',
                    cn : [{cls: ['neo-day-number'], html: 19, id: 'neo-component-6__day_number__2021-05-19'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-20',
                    cn : [{cls: ['neo-day-number'], html: 20, id: 'neo-component-6__day_number__2021-05-20'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-21',
                    cn : [{cls: ['neo-day-number'], html: 21, id: 'neo-component-6__day_number__2021-05-21'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-22',
                    cn : [{cls: ['neo-day-number'], html: 22, id: 'neo-component-6__day_number__2021-05-22'}]
                }],
                id  : 'neo-component-6__week__2021-05-16'
            }, {
                flag: '2021-05-23',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-23',
                    cn : [{cls: ['neo-day-number'], html: 23, id: 'neo-component-6__day_number__2021-05-23'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-24',
                    cn : [{cls: ['neo-day-number'], html: 24, id: 'neo-component-6__day_number__2021-05-24'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-25',
                    cn : [{cls: ['neo-day-number'], html: 25, id: 'neo-component-6__day_number__2021-05-25'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-26',
                    cn : [{cls: ['neo-day-number'], html: 26, id: 'neo-component-6__day_number__2021-05-26'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-27',
                    cn : [{cls: ['neo-day-number'], html: 27, id: 'neo-component-6__day_number__2021-05-27'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-28',
                    cn : [{cls: ['neo-day-number'], html: 28, id: 'neo-component-6__day_number__2021-05-28'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-29',
                    cn : [{cls: ['neo-day-number'], html: 29, id: 'neo-component-6__day_number__2021-05-29'}]
                }],
                id  : 'neo-component-6__week__2021-05-23'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    id : 'neo-vnode-152',
                    cls: ['neo-month-header-content'],
                    cn : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name',
                        html: 'Jun',
                        id  : 'neo-vnode-151'
                    }, {vtype: 'text', html: ' 2021', id: 'neo-vtext-2'}]
                }],
                id : 'neo-vnode-153'
            }, {
                flag: '2021-06-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-05-30',
                    cn : [{cls: ['neo-day-number'], html: 30, id: 'neo-component-6__day_number__2021-05-30'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-05-31',
                    cn : [{cls: ['neo-day-number'], html: 31, id: 'neo-component-6__day_number__2021-05-31'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-01',
                    cn : [{cls: ['neo-day-number'], html: 1, id: 'neo-component-6__day_number__2021-06-01'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-02',
                    cn : [{cls: ['neo-day-number'], html: 2, id: 'neo-component-6__day_number__2021-06-02'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-03',
                    cn : [{cls: ['neo-day-number'], html: 3, id: 'neo-component-6__day_number__2021-06-03'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-04',
                    cn : [{cls: ['neo-day-number'], html: 4, id: 'neo-component-6__day_number__2021-06-04'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-05',
                    cn : [{cls: ['neo-day-number'], html: 5, id: 'neo-component-6__day_number__2021-06-05'}]
                }],
                id  : 'neo-component-6__week__2021-05-30'
            }, {
                flag: '2021-06-06',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-06',
                    cn : [{cls: ['neo-day-number'], html: 6, id: 'neo-component-6__day_number__2021-06-06'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-07',
                    cn : [{cls: ['neo-day-number'], html: 7, id: 'neo-component-6__day_number__2021-06-07'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-08',
                    cn : [{cls: ['neo-day-number'], html: 8, id: 'neo-component-6__day_number__2021-06-08'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-09',
                    cn : [{cls: ['neo-day-number'], html: 9, id: 'neo-component-6__day_number__2021-06-09'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-10',
                    cn : [{cls: ['neo-day-number'], html: 10, id: 'neo-component-6__day_number__2021-06-10'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-11',
                    cn : [{cls: ['neo-day-number'], html: 11, id: 'neo-component-6__day_number__2021-06-11'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-12',
                    cn : [{cls: ['neo-day-number'], html: 12, id: 'neo-component-6__day_number__2021-06-12'}]
                }],
                id  : 'neo-component-6__week__2021-06-06'
            }, {
                flag: '2021-06-13',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-13',
                    cn : [{cls: ['neo-day-number'], html: 13, id: 'neo-component-6__day_number__2021-06-13'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-14',
                    cn : [{cls: ['neo-day-number'], html: 14, id: 'neo-component-6__day_number__2021-06-14'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-15',
                    cn : [{cls: ['neo-day-number'], html: 15, id: 'neo-component-6__day_number__2021-06-15'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-16',
                    cn : [{cls: ['neo-day-number'], html: 16, id: 'neo-component-6__day_number__2021-06-16'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-17',
                    cn : [{cls: ['neo-day-number'], html: 17, id: 'neo-component-6__day_number__2021-06-17'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-18',
                    cn : [{cls: ['neo-day-number'], html: 18, id: 'neo-component-6__day_number__2021-06-18'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-19',
                    cn : [{cls: ['neo-day-number'], html: 19, id: 'neo-component-6__day_number__2021-06-19'}]
                }],
                id  : 'neo-component-6__week__2021-06-13'
            }, {
                flag: '2021-06-20',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-20',
                    cn : [{cls: ['neo-day-number'], html: 20, id: 'neo-component-6__day_number__2021-06-20'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-21',
                    cn : [{cls: ['neo-day-number'], html: 21, id: 'neo-component-6__day_number__2021-06-21'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-22',
                    cn : [{cls: ['neo-day-number'], html: 22, id: 'neo-component-6__day_number__2021-06-22'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-23',
                    cn : [{cls: ['neo-day-number'], html: 23, id: 'neo-component-6__day_number__2021-06-23'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-24',
                    cn : [{cls: ['neo-day-number'], html: 24, id: 'neo-component-6__day_number__2021-06-24'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-25',
                    cn : [{cls: ['neo-day-number'], html: 25, id: 'neo-component-6__day_number__2021-06-25'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-26',
                    cn : [{cls: ['neo-day-number'], html: 26, id: 'neo-component-6__day_number__2021-06-26'}]
                }],
                id  : 'neo-component-6__week__2021-06-20'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    cls: ['neo-month-header-content'],
                    cn : [{tag: 'span', cls: ['neo-month-name'], flag: 'month-name', html: 'Jul'}, {
                        vtype: 'text',
                        html : ' 2021'
                    }]
                }]
            }, {
                flag: '2021-07-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-06-27',
                    cn : [{cls: ['neo-day-number'], html: 27, id: 'neo-component-6__day_number__2021-06-27'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-28',
                    cn : [{cls: ['neo-day-number'], html: 28, id: 'neo-component-6__day_number__2021-06-28'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-29',
                    cn : [{cls: ['neo-day-number'], html: 29, id: 'neo-component-6__day_number__2021-06-29'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-06-30',
                    cn : [{cls: ['neo-day-number'], html: 30, id: 'neo-component-6__day_number__2021-06-30'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-01',
                    cn : [{cls: ['neo-day-number'], html: 1, id: 'neo-component-6__day_number__2021-07-01'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-02',
                    cn : [{cls: ['neo-day-number'], html: 2, id: 'neo-component-6__day_number__2021-07-02'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-03',
                    cn : [{cls: ['neo-day-number'], html: 3, id: 'neo-component-6__day_number__2021-07-03'}]
                }],
                id  : 'neo-component-6__week__2021-06-27'
            }, {
                flag: '2021-07-04',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-04',
                    cn : [{cls: ['neo-day-number'], html: 4, id: 'neo-component-6__day_number__2021-07-04'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-05',
                    cn : [{cls: ['neo-day-number'], html: 5, id: 'neo-component-6__day_number__2021-07-05'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-06',
                    cn : [{cls: ['neo-day-number'], html: 6, id: 'neo-component-6__day_number__2021-07-06'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-07',
                    cn : [{cls: ['neo-day-number'], html: 7, id: 'neo-component-6__day_number__2021-07-07'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-08',
                    cn : [{cls: ['neo-day-number'], html: 8, id: 'neo-component-6__day_number__2021-07-08'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-09',
                    cn : [{cls: ['neo-day-number'], html: 9, id: 'neo-component-6__day_number__2021-07-09'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-10',
                    cn : [{cls: ['neo-day-number'], html: 10, id: 'neo-component-6__day_number__2021-07-10'}]
                }],
                id  : 'neo-component-6__week__2021-07-04'
            }, {
                flag: '2021-07-11',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-11',
                    cn : [{cls: ['neo-day-number'], html: 11, id: 'neo-component-6__day_number__2021-07-11'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-12',
                    cn : [{cls: ['neo-day-number'], html: 12, id: 'neo-component-6__day_number__2021-07-12'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-13',
                    cn : [{cls: ['neo-day-number'], html: 13, id: 'neo-component-6__day_number__2021-07-13'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-14',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 14,
                        id  : 'neo-component-6__day_number__2021-07-14'
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 1,
                        id      : 'neo-component-6__1',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Event 1',
                            id  : 'neo-component-6__title__1'
                        }, {cls: ['neo-event-time'], html: '09:15', id: 'neo-component-6__time__1'}]
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 2,
                        id      : 'neo-component-6__2',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Event 2',
                            id  : 'neo-component-6__title__2'
                        }, {cls: ['neo-event-time'], html: '11:30', id: 'neo-component-6__time__2'}]
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 3,
                        id      : 'neo-component-6__3',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Event 3 with a long title',
                            id  : 'neo-component-6__title__3'
                        }, {cls: ['neo-event-time'], html: '13:45', id: 'neo-component-6__time__3'}]
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 4,
                        id      : 'neo-component-6__4',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Event 4',
                            id  : 'neo-component-6__title__4'
                        }, {cls: ['neo-event-time'], html: '16:00', id: 'neo-component-6__time__4'}]
                    }]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-15',
                    cn : [{cls: ['neo-day-number'], html: 15, id: 'neo-component-6__day_number__2021-07-15'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-16',
                    cn : [{cls: ['neo-day-number'], html: 16, id: 'neo-component-6__day_number__2021-07-16'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-17',
                    cn : [{cls: ['neo-day-number'], html: 17, id: 'neo-component-6__day_number__2021-07-17'}]
                }],
                id  : 'neo-component-6__week__2021-07-11'
            }, {
                flag: '2021-07-18',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-18',
                    cn : [{cls: ['neo-day-number'], html: 18, id: 'neo-component-6__day_number__2021-07-18'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-19',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 19,
                        id  : 'neo-component-6__day_number__2021-07-19'
                    }, {
                        cls     : ['neo-event', 'neo-yellow'],
                        flag    : 5,
                        id      : 'neo-component-6__5',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Coding',
                            id  : 'neo-component-6__title__5'
                        }, {cls: ['neo-event-time'], html: '09:15', id: 'neo-component-6__time__5'}]
                    }]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-20',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 20,
                        id  : 'neo-component-6__day_number__2021-07-20'
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 6,
                        id      : 'neo-component-6__6',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Coding',
                            id  : 'neo-component-6__title__6'
                        }, {cls: ['neo-event-time'], html: '09:15', id: 'neo-component-6__time__6'}]
                    }]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-21',
                    cn : [{cls: ['neo-day-number'], html: 21, id: 'neo-component-6__day_number__2021-07-21'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-22',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 22,
                        id  : 'neo-component-6__day_number__2021-07-22'
                    }, {
                        cls     : ['neo-event', 'neo-orange'],
                        flag    : 7,
                        id      : 'neo-component-6__7',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Breakfast',
                            id  : 'neo-component-6__title__7'
                        }, {cls: ['neo-event-time'], html: '08:00', id: 'neo-component-6__time__7'}]
                    }, {
                        cls     : ['neo-event', 'neo-blue'],
                        flag    : 8,
                        id      : 'neo-component-6__8',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Lunch Break 1',
                            id  : 'neo-component-6__title__8'
                        }, {cls: ['neo-event-time'], html: '12:00', id: 'neo-component-6__time__8'}]
                    }]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-23',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 23,
                        id  : 'neo-component-6__day_number__2021-07-23'
                    }, {
                        cls     : ['neo-event', 'neo-green'],
                        flag    : 9,
                        id      : 'neo-component-6__9',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Lunch Break 2',
                            id  : 'neo-component-6__title__9'
                        }, {cls: ['neo-event-time'], html: '12:00', id: 'neo-component-6__time__9'}]
                    }, {
                        cls     : ['neo-event', 'neo-pink'],
                        flag    : 10,
                        id      : 'neo-component-6__10',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Dinner',
                            id  : 'neo-component-6__title__10'
                        }, {cls: ['neo-event-time'], html: '19:30', id: 'neo-component-6__time__10'}]
                    }]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-24',
                    cn : [{cls: ['neo-day-number'], html: 24, id: 'neo-component-6__day_number__2021-07-24'}]
                }],
                id  : 'neo-component-6__week__2021-07-18'
            }, {
                flag: '2021-07-25',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-25',
                    cn : [{cls: ['neo-day-number'], html: 25, id: 'neo-component-6__day_number__2021-07-25'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-26',
                    cn : [{cls: ['neo-day-number'], html: 26, id: 'neo-component-6__day_number__2021-07-26'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-27',
                    cn : [{cls: ['neo-day-number'], html: 27, id: 'neo-component-6__day_number__2021-07-27'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-28',
                    cn : [{cls: ['neo-day-number'], html: 28, id: 'neo-component-6__day_number__2021-07-28'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-29',
                    cn : [{
                        cls : ['neo-day-number'],
                        html: 29,
                        id  : 'neo-component-6__day_number__2021-07-29'
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 11,
                        id      : 'neo-component-6__11',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Lunch Break 3',
                            id  : 'neo-component-6__title__11'
                        }, {cls: ['neo-event-time'], html: '12:00', id: 'neo-component-6__time__11'}]
                    }, {
                        cls     : ['neo-event', 'neo-red'],
                        flag    : 12,
                        id      : 'neo-component-6__12',
                        tabIndex: -1,
                        cn      : [{
                            cls : ['neo-event-title'],
                            html: 'Siesta',
                            id  : 'neo-component-6__title__12'
                        }, {cls: ['neo-event-time'], html: '14:00', id: 'neo-component-6__time__12'}]
                    }]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-07-30',
                    cn : [{cls: ['neo-day-number'], html: 30, id: 'neo-component-6__day_number__2021-07-30'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-07-31',
                    cn : [{cls: ['neo-day-number'], html: 31, id: 'neo-component-6__day_number__2021-07-31'}]
                }],
                id  : 'neo-component-6__week__2021-07-25'
            }, {
                cls: ['neo-month-header'],
                cn : [{
                    cls: ['neo-month-header-content'],
                    cn : [{tag: 'span', cls: ['neo-month-name'], flag: 'month-name', html: 'Aug'}, {
                        vtype: 'text',
                        html : ' 2021'
                    }]
                }]
            }, {
                flag: '2021-08-01',
                cls : ['neo-week'],
                cn  : [{
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-08-01',
                    cn : [{cls: ['neo-day-number'], html: 1, id: 'neo-component-6__day_number__2021-08-01'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-08-02',
                    cn : [{cls: ['neo-day-number'], html: 2, id: 'neo-component-6__day_number__2021-08-02'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-08-03',
                    cn : [{cls: ['neo-day-number'], html: 3, id: 'neo-component-6__day_number__2021-08-03'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-08-04',
                    cn : [{cls: ['neo-day-number'], html: 4, id: 'neo-component-6__day_number__2021-08-04'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-08-05',
                    cn : [{cls: ['neo-day-number'], html: 5, id: 'neo-component-6__day_number__2021-08-05'}]
                }, {
                    cls: ['neo-day'],
                    id : 'neo-component-6__day__2021-08-06',
                    cn : [{cls: ['neo-day-number'], html: 6, id: 'neo-component-6__day_number__2021-08-06'}]
                }, {
                    cls: ['neo-day', 'neo-weekend'],
                    id : 'neo-component-6__day__2021-08-07',
                    cn : [{cls: ['neo-day-number'], html: 7, id: 'neo-component-6__day_number__2021-08-07'}]
                }],
                id  : 'neo-component-6__week__2021-08-01'
            }]
        };

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 16, 'Count deltas equals 16');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-vnode-3', index: 14, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-component-6__week__2021-06-27', index: 15, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-component-6__week__2021-07-04', index: 16, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-component-6__week__2021-07-11', index: 17, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-component-6__week__2021-07-18', index: 18, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-component-6__week__2021-07-25', index: 19, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-vnode-6', index: 20, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'insertNode', id: 'neo-component-6__week__2021-08-01', index: 21, parentId: 'neo-vnode-150', outerHTML: t.any(String)},
            {action: 'removeNode', id: 'neo-component-6__week__2021-02-21', parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-vnode-168',                     parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-component-6__week__2021-02-28', parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-component-6__week__2021-03-07', parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-component-6__week__2021-03-14', parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-component-6__week__2021-03-21', parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-vnode-171',                     parentId: 'neo-vnode-150'},
            {action: 'removeNode', id: 'neo-component-6__week__2021-03-28', parentId: 'neo-vnode-150'}
        ], 'deltas got created successfully');


        //let removedQuotes = JSON.stringify(deltas).replace(/"[^"]*":/g, match => match.replace(/"/g, ''));
        //console.log(removedQuotes);
    });
});
