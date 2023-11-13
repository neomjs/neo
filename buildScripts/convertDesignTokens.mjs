import fs   from 'fs-extra';
import os   from 'os';
import path from 'path';

let jsonPath    = './resources/design-tokens/json',
    jsonFolder  = fs.readdirSync(jsonPath),
    tokenPrefix = '',
    tokenRegex  = new RegExp(/{(.*?)}/g),
    emptyString, fileContent, keyMaxLength, map, match, matches, output;

function capitalize(value) {
    return value[0].toUpperCase() + value.slice(1);
}

function createEmptyString(len) {
    return ' '.repeat(len);
}

function parseTokens(fileContent, prefix=tokenPrefix, map=[]) {
    let baseKey, baseValue, keyValue, keys, modify, ns;

    Object.entries(fileContent).forEach(([key, value]) => {
        key = key.replace(/\?/g, '');
        key = key.replace(/&/g, '-'); // some token names contain & chars
        ns  = prefix === tokenPrefix ? (tokenPrefix + key) : key === 'value' ? prefix : `${prefix}-${key}`;

        if (typeof value === 'object') {
            keys   = Object.keys(value);
            modify = value[keys[0]]?.$extensions?.['studio.tokens']?.modify || // the first key could contain the value,
                     value[keys[1]]?.$extensions?.['studio.tokens']?.modify;   // so we are checking the 2nd too

            if (modify) {
                // assuming that each object contains its base value
                keys.forEach(objKey => {
                    if (!value[objKey].$extensions) {
                        baseKey   = objKey;
                        baseValue = value[baseKey].value;
                    }
                });

                keys.forEach(objKey => {
                    if (objKey !== baseKey) {
                        modify   = value[objKey].$extensions?.['studio.tokens']?.modify;
                        keyValue = `${modify.type}(${baseValue}, ${modify.value * 100}%)`;

                        map.push([`${ns}-${objKey}`, keyValue]);
                    } else {
                        parseTokens(value[baseKey], `${ns}-${baseKey}`, map);
                    }
                })
            } else {
                parseTokens(value, ns, map);
            }
        } else if (key !== 'description' && key !== 'type') {
            if (typeof value === 'string') {
                if (!value.includes('{')) {
                    if (value.includes(' ')) {
                        value = `'${value}'`;
                    }
                } else {
                    value   = value.replace(/\?/g, '');
                    matches = value.matchAll(tokenRegex);

                    // replace . with - only inside each token
                    for (match of matches) {
                        value = value.replace(match[0], match[0].replace(/\./g, '-'));
                    }

                    /*
                     * some design tokens contain operations without empty spaces
                     * e.g. {token}*0.9
                     * calc() relies on having spaces around operators
                     */
                    value = value.replace(/(\S)(\*)(\S)/g, '$1 $2 $3');
                    value = value.replace(/(\S)(\/)(\S)/g, '$1 $2 $3');

                    // most likely a multiplication
                    if (!value.endsWith('}')) {
                        value = `calc(${value})`;
                    }

                    // convert tokens into CSS variables
                    value = value.replace(/{(.*?)}/g, `var(--${tokenPrefix}$1)`);

                    // multiple occurrences of a css variable need to get wrapped into calc()
                    if (value.indexOf('var') !== value.lastIndexOf('var')) {
                        value = `calc(${value})`;
                    }

                    // -token needs to get converted
                    if (value.startsWith('-')) {
                        value = `calc(${value.substring(1)} * -1)`
                    }
                }
            }

            map.push([ns, value]);
        }
    });

    return map;
}

function replaceObjectValue(obj) {
    Object.entries(obj).forEach(([key, value]) => {
        if (key === 'value') {
            if (typeof value === 'object') {
                Object.entries(value).forEach(([valKey, prop]) => {
                    // some token vars contain an empty string, which SCSS can not handle.
                    if (prop === '') {
                        prop = 'none';
                    }

                    obj[valKey] = {
                        type : obj.type,
                        value: prop
                    };
                });

                delete obj.type;
                delete obj.value;
            }
        } else if (typeof value === 'object') {
            replaceObjectValue(value);
        }
    });
}

function sortArray(a, b) {
    const nameA = a[0].toUpperCase();
    const nameB = b[0].toUpperCase();
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }

    return 0;
}

jsonFolder.forEach(fileName => {
    if (fileName.endsWith(".json")) {
        console.log('Parsing file:', fileName);

        fileContent  = JSON.parse(fs.readFileSync(path.join(jsonPath, fileName)));
        keyMaxLength = 0;
        output       = [':root .neo-theme-neo-light {'];

        replaceObjectValue(fileContent);

        map = parseTokens(fileContent);

        map.sort(sortArray);

        map.forEach(item => {
            keyMaxLength = Math.max(item[0].length, keyMaxLength);
        });

        map.forEach(item => {
            emptyString = createEmptyString(keyMaxLength - item[0].length);

            output.push(`    --${item[0] + emptyString}: ${item[1]};`);
        });

        output.push('}');
        output.push('');

        fileName = capitalize(fileName.split('.').shift()) + '.scss'

        fs.writeFileSync(path.join('./resources/scss/theme-neo-light/design-tokens/', fileName), output.join(os.EOL));
    }
});
