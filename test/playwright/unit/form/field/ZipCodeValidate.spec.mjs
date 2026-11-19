import {setup} from '../../../setup.mjs';

const appName = 'FormFieldZipCodeValidateTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import ComboBox       from '../../../../../src/form/field/ComboBox.mjs';
import Container      from '../../../../../src/container/Base.mjs';
import Country        from '../../../../../src/form/field/Country.mjs';
import ZipCode        from '../../../../../src/form/field/ZipCode.mjs';

/**
 * @summary Pins what `Neo.form.field.ZipCode` accepts per country, including the country it does not know.
 *
 * ZipCode reassigns `inputPattern` from the static `countryCodes` map in `afterSetCountryCode`, so the
 * pattern a field validates against is a function of its `countryCode` rather than a class default.
 * `countryCodes` holds `AT`, `CH` and `DE` only; the not-in-the-map case is pinned here to what the
 * source actually does (`ZipCode.countryCodes[value] || null`) rather than to an assumption about it.
 */
test.describe('Neo.form.field.ZipCode — validate() per countryCode', () => {
    const createField = config => Neo.create(ZipCode, {appName, ...config});

    test('AT and CH accept four digits and reject everything else', () => {
        for (const countryCode of ['AT', 'CH']) {
            const field = createField({countryCode, value: '1234'});

            expect(field.validate(), `${countryCode} should accept 1234`).toBe(true);

            for (const value of ['123', '12345', '12345', 'abcd', '12a4']) {
                field.value = value;
                expect(field.validate(), `${countryCode} should reject ${JSON.stringify(value)}`).toBe(false)
            }
        }
    });

    test('DE accepts five digits and excludes the reserved edges', () => {
        const field = createField({countryCode: 'DE', value: '10115'});

        expect(field.validate()).toBe(true);

        // 01000 and 99999 are excluded by the pattern's negative lookahead, not by length.
        for (const value of ['01000', '99999', '1234', '123456', '00000']) {
            field.value = value;
            expect(field.validate(), `DE should reject ${JSON.stringify(value)}`).toBe(false)
        }

        field.value = '01067';
        expect(field.validate(), 'DE should accept 01067').toBe(true)
    });

    test('the same value changes verdict with the country', () => {
        const field = createField({countryCode: 'AT', value: '1234'});

        expect(field.validate(), 'four digits are valid for AT').toBe(true);

        field.countryCode = 'DE';

        expect(field.validate(), 'four digits are not valid for DE').toBe(false)
    });

    test('a country outside the map clears the pattern, so any non-empty value passes', () => {
        const field = createField({countryCode: 'US', value: '1234'});

        expect(field.countryCode).toBe('US');
        expect(field.inputPattern, 'US is not in countryCodes, so no pattern is applied').toBe(null);
        expect(field.validate(), 'with no pattern set, validation has nothing to reject').toBe(true);

        field.value = 'not a zip at all';

        expect(field.validate()).toBe(true)
    });

    test('an empty value alone is not invalid — required is what makes it so', () => {
        expect(createField({countryCode: 'DE', value: ''}).validate()).toBe(true);

        const required = createField({countryCode: 'DE', required: true, value: ''});

        expect(required.validate()).toBe(false);
        expect(required._error).toBe(required.errorTextRequired)
    });

    test('validate(false) sets the error text and validate(true) leaves it alone', () => {
        const silent = createField({countryCode: 'DE', value: '1234'});

        expect(silent.validate(true)).toBe(false);
        expect(silent._error).toBe(silent.errorTextInputPattern({inputPattern: silent.inputPattern, maxLength: silent.maxLength, minLength: silent.minLength, valueLength: 4}));
        expect(silent.cls).not.toContain('neo-invalid');

        const loud = createField({countryCode: 'DE', value: '1234'});

        expect(loud.validate(false)).toBe(false);
        expect(loud.cls).toContain('neo-invalid')
    });
});

test.describe('Neo.form.field.ZipCode <-> Neo.form.field.Country linking', () => {
    let created = [];

    const track = instance => {
        created.push(instance);
        return instance
    };

    test.afterEach(() => {
        while (created.length) {
            const instance = created.pop();
            !instance.isDestroyed && instance.destroy()
        }
    });

    test('countryField syncs lowercase Country record codes and re-validates dirty values on change and clear', () => {
        const country = track(Neo.create(Country, {appName, value: 'de'})),
              zip     = track(Neo.create(ZipCode, {appName, countryField: country, value: '1234'}));

        expect(zip.countryCode).toBe('DE');
        expect(zip.validate(false)).toBe(false);
        expect(zip.cls).toContain('neo-invalid');

        // Switching Country to Austria ('at') updates countryCode -> 'AT' and re-validates '1234' as valid
        country.value = 'at';
        expect(zip.countryCode).toBe('AT');
        expect(zip.cls).not.toContain('neo-invalid');
        expect(zip._error).toBe(null);

        // Switching back to Germany ('de') re-marks '1234' invalid, then clearing Country clears pattern and error
        country.value = 'de';
        expect(zip.countryCode).toBe('DE');
        expect(zip.cls).toContain('neo-invalid');

        country.value = null;
        expect(zip.countryCode).toBe(null);
        expect(zip.inputPattern).toBe(null);
        expect(zip.cls).not.toContain('neo-invalid')
    });

    test('string references resolve across sibling orders, nested rows, and dynamic container.add()', () => {
        // Order 1: Country precedes ZipCode and links forward via zipCodeField: 'zip'
        const forwardForm = track(Neo.create(Container, {
            appName,
            items: [{
                module      : Country,
                reference   : 'country',
                value       : 'de',
                zipCodeField: 'zip'
            }, {
                module   : ZipCode,
                reference: 'zip',
                value    : '10115'
            }]
        }));

        const forwardCountry = forwardForm.getReference('country'),
              forwardZip     = forwardForm.getReference('zip');

        expect(forwardCountry.zipCodeField).toBe(forwardZip);
        expect(forwardZip.countryField).toBe(forwardCountry);
        expect(forwardZip.countryCode).toBe('DE');
        expect(forwardZip.validate()).toBe(true);

        // Order 2: Nested rows where ZipCode precedes Country and links forward via countryField: 'country'
        const nestedForm = track(Neo.create(Container, {
            appName,
            items: [{
                module: Container,
                items : [{
                    module      : ZipCode,
                    countryField: 'country',
                    reference   : 'zip',
                    value       : '1234'
                }]
            }, {
                module: Container,
                items : [{
                    module   : Country,
                    reference: 'country',
                    value    : 'ch'
                }]
            }]
        }));

        const nestedZip = nestedForm.getReference('zip');
        expect(nestedZip.countryCode).toBe('CH');
        expect(nestedZip.validate()).toBe(true);

        // Order 3: Standalone ZipCode with countryField string reference added dynamically to a Container
        const dynamicContainer = track(Neo.create(Container, {
            appName,
            items: [{
                module   : Country,
                reference: 'country',
                value    : 'de'
            }]
        }));

        const standaloneZip = track(Neo.create(ZipCode, {
            appName,
            countryField: 'country',
            value       : '1234'
        }));

        expect(standaloneZip.countryField).toBe(null);
        dynamicContainer.add(standaloneZip);

        expect(standaloneZip.countryField).toBe(dynamicContainer.getReference('country'));
        expect(standaloneZip.countryCode).toBe('DE');
        expect(standaloneZip.validate()).toBe(false)
    });

    test('supports custom id-keyed ComboBox stores and detaches listeners on replacement or destroy', () => {
        const customCombo = track(Neo.create(ComboBox, {
            appName,
            displayField: 'name',
            store       : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',   type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                },
                data: [
                    {id: 'AT', name: 'Austria'},
                    {id: 'DE', name: 'Germany'}
                ]
            },
            value: 'AT'
        }));

        const secondCountry = track(Neo.create(Country, {appName, value: null})),
              zip           = track(Neo.create(ZipCode, {appName, countryField: customCombo, value: '1234'}));

        expect(zip.countryCode).toBe('AT');
        expect(zip.validate()).toBe(true);

        // Replacing countryField with an empty Country field detaches customCombo and syncs countryCode -> null
        zip.countryField = secondCountry;
        expect(zip.countryCode).toBe(null);

        // Mutating the old customCombo must no longer affect zip
        customCombo.value = 'DE';
        expect(zip.countryCode).toBe(null);

        // Destroying zip detaches from secondCountry cleanly so subsequent changes do not touch destroyed zip
        zip.destroy();
        expect(() => {secondCountry.value = 'de'}).not.toThrow()
    });
});
