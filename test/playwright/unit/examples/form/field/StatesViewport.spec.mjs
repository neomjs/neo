import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'FieldStatesTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import StatesViewport from '../../../../../../examples/form/field/StatesViewport.mjs';

import CheckBox        from '../../../../../../examples/form/field/checkbox/MainContainer.mjs';
import Chip            from '../../../../../../examples/form/field/chip/MainContainer.mjs';
import Color           from '../../../../../../examples/form/field/color/MainContainer.mjs';
import ComboBox        from '../../../../../../examples/form/field/combobox/MainContainer.mjs';
import CopyToClipboard from '../../../../../../examples/form/field/trigger/copyToClipboard/MainContainer.mjs';
import Country         from '../../../../../../examples/form/field/country/MainContainer.mjs';
import Currency        from '../../../../../../examples/form/field/currency/MainContainer.mjs';
import DateEntry       from '../../../../../../examples/form/field/date/MainContainer.mjs';
import Display         from '../../../../../../examples/form/field/display/MainContainer.mjs';
import Email           from '../../../../../../examples/form/field/email/MainContainer.mjs';
import FileUpload      from '../../../../../../examples/form/field/fileupload/MainContainer.mjs';
import IBAN            from '../../../../../../examples/form/field/iban/MainContainer.mjs';
import NumberEntry     from '../../../../../../examples/form/field/number/MainContainer.mjs';
import Password        from '../../../../../../examples/form/field/password/MainContainer.mjs';
import Phone           from '../../../../../../examples/form/field/phone/MainContainer.mjs';
import Radio           from '../../../../../../examples/form/field/radio/MainContainer.mjs';
import Range           from '../../../../../../examples/form/field/range/MainContainer.mjs';
import Search          from '../../../../../../examples/form/field/search/MainContainer.mjs';
import Select          from '../../../../../../examples/form/field/select/MainContainer.mjs';
import Switch          from '../../../../../../examples/form/field/switch/MainContainer.mjs';
import Text            from '../../../../../../examples/form/field/text/MainContainer.mjs';
import TextArea        from '../../../../../../examples/form/field/textarea/MainContainer.mjs';
import Time            from '../../../../../../examples/form/field/time/MainContainer.mjs';
import Url             from '../../../../../../examples/form/field/url/MainContainer.mjs';
import ZipCode         from '../../../../../../examples/form/field/zipcode/MainContainer.mjs';

const entries = {
    CheckBox, Chip, Color, ComboBox, CopyToClipboard, Country, Currency, DateEntry, Display, Email, FileUpload, IBAN,
    NumberEntry, Password, Phone, Radio, Range, Search, Select, Switch, Text, TextArea, Time, Url, ZipCode
};

// The main-thread addons a viewport calls. Installed per test: other spec files in a shared worker replace
// `Neo.main.DomAccess` or delete its methods, so a stub set once per file can be gone by its next test.
const stubs = {
    DomAccess: {applyBodyCls: () => {}, setBodyCls: async () => {}},
    DomEvents: {isSingleton: true, registerDisabledInputChars: () => {}, unregisterDisabledInputChars: () => {}}
};

let originals;

test.beforeEach(() => {
    Neo.main ??= {};
    originals = Object.fromEntries(Object.keys(stubs).map(addon => [addon, Neo.main[addon]]));

    Object.entries(stubs).forEach(([addon, methods]) => {
        Neo.main[addon] = {...Neo.main[addon], ...methods}
    })
});

test.afterEach(() => {
    Object.entries(originals).forEach(([addon, original]) => {
        if (original) {
            Neo.main[addon] = original
        } else {
            delete Neo.main[addon]
        }
    })
});

/**
 * @param {Neo.examples.form.field.StatesViewport} viewport
 * @returns {Object} The stage's example container, its state cells, their captions and their fields
 */
function stageOf(viewport) {
    let container = viewport.items[0].items[1],
        cells     = container.items[1]?.items || [];

    return {
        captions: cells.map(cell => cell.items[0].text),
        cells,
        container,
        fields  : cells.map(cell => cell.items[1])
    }
}

test.describe('StatesViewport: a field workbench shows the field in its states', () => {
    test('every entry leads its stage with the live field and follows it with the states its type lists', () => {
        Object.entries(entries).forEach(([name, Entry]) => {
            let viewport = Neo.create(Entry, {autoMount: false});

            try {
                let {captions, container, fields} = stageOf(viewport),
                    {field, states}               = viewport,
                    expected                      = Entry.sheet.filter(({key}) => states[key]);

                expect(viewport, name).toBeInstanceOf(StatesViewport);
                expect(container.items[0], `${name}: the live field is the stage's first item`).toBe(viewport.exampleComponent);
                expect(captions, name).toEqual(expected.map(({caption}) => caption));

                fields.forEach(stateField => {
                    expect(stateField, name).toBeInstanceOf(field.module);
                    expect(stateField.id, name).not.toBe(viewport.exampleComponent.id)
                });

                states.invalid && expect(viewport.down({reference: 'state-invalid'}).error, `${name}: the invalid state shows its own message`).toBeTruthy()
            } finally {
                viewport.destroy()
            }
        })
    });

    test('no stage title is a class name', () => {
        Object.entries(entries).forEach(([name, Entry]) => {
            let viewport = Neo.create(Entry, {autoMount: false});

            try {
                let title     = viewport.down({reference: 'stage-title'}).text,
                    classPart = viewport.exampleComponent.className.split('.').pop();

                expect(title, name).toBe(viewport.componentName);
                expect(title, name).not.toBe(classPart);
                expect(title, name).not.toContain('.')
            } finally {
                viewport.destroy()
            }
        })
    });

    test('each state renders the same field: empty and invalid without a value, disabled and read-only filled', () => {
        let viewport = Neo.create(Text, {autoMount: false});

        try {
            let {fields}                             = stageOf(viewport),
                [empty, invalid, disabled, readOnly] = fields,
                live                                 = viewport.exampleComponent;

            expect(live.value).toBe('Neo Workspace');
            expect(fields.map(stateField => stateField.labelText)).toEqual(Array(4).fill('Project name'));

            expect(empty.value).toBeNull();
            expect(empty.placeholderText).toBe('Name your project');
            expect(invalid.value).toBe('Ne');
            expect(invalid.error).toBe('Min length violation: 2 / 3');

            expect(disabled.disabled).toBe(true);
            expect(disabled.value).toBe('Neo Workspace');
            expect(readOnly.readOnly).toBe(true);
            expect(readOnly.value).toBe('Neo Workspace');

            expect(live.disabled).toBeFalsy();
            expect(live.readOnly).toBe(false)
        } finally {
            viewport.destroy()
        }
    });

    test('an empty state shows no value and a placeholder, wherever its field has one', () => {
        const
            isEmpty = value => value == null || value === '' || (Array.isArray(value) && !value.length),
            missing = [];

        Object.entries(entries).forEach(([name, Entry]) => {
            let viewport = Neo.create(Entry, {autoMount: false});

            try {
                let empty = viewport.states.empty && viewport.down({reference: 'state-empty'});

                if (empty && 'placeholderText' in empty && !(isEmpty(empty.value) && /\S/.test(empty.placeholderText ?? ''))) {
                    missing.push(name)
                }
            } finally {
                viewport.destroy()
            }
        });

        expect(missing, 'empty states with a value or without a placeholder').toEqual([])
    });

    test('an inspector change reaches the live field and leaves the states as they are', () => {
        let viewport = Neo.create(Text, {autoMount: false});

        try {
            let {fields} = stageOf(viewport);

            viewport.onConfigChange('labelText', {value: 'Codename'});
            expect(viewport.exampleComponent.labelText).toBe('Codename');
            expect(fields.map(stateField => stateField.labelText)).toEqual(Array(4).fill('Project name'));

            viewport.onReset();
            expect(viewport.exampleComponent.labelText).toBe('Project name')
        } finally {
            viewport.destroy()
        }
    });

    test('a check box type has no read-only state, and each radio stands in a group of its own', () => {
        let viewport = Neo.create(Radio, {autoMount: false});

        try {
            let {captions, fields} = stageOf(viewport);

            expect(captions).toEqual(['Empty', 'Invalid', 'Disabled']);
            expect([viewport.exampleComponent, ...fields].map(radio => radio.name))
                .toEqual(['delivery', 'delivery-empty', 'delivery-invalid', 'delivery-disabled']);
            expect(fields[1].error).toBe('Required')
        } finally {
            viewport.destroy()
        }
    });

    test('a type with states of its own lists them in its own sheet', () => {
        let viewport = Neo.create(FileUpload, {autoMount: false});

        try {
            let {captions, fields} = stageOf(viewport);

            expect(captions).toEqual(['Uploaded', 'Deleted', 'Malware found', 'Error', 'Disabled']);
            // The demo server serves no documents: the uploaded sample must not offer a download
            expect(fields.map(upload => upload.state)).toEqual(['not-downloadable', 'deleted', 'scan-failed', 'error', 'ready']);
            expect(viewport.exampleComponent.state).toBe('ready')
        } finally {
            viewport.destroy()
        }
    })
});
