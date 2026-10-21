/**
 * Fields of the rows Viewport#createRandomData() builds: an id, plus a value and a background color per column
 * @type {Object[]}
 */
const fields = [{name: 'id', type: 'Integer'}];

for (let i = 0; i < 10; i++) {
    fields.push({name: 'column' + i, type: 'String'}, {name: 'column' + i + 'style', type: 'String'})
}

export default fields;
