# neo.mjs Coding Guidelines

Inside the neo repo the following coding guidelines are mandatory.
They ensure a high code quality and consistency.
We strongly recommend to also stick to them when creating your own workspaces and apps via `npx neo-app`.

In case you do find spots inside the neo.mjs code base which do not stick to the new guidelines,
you are very welcome to create a ticket here: https://github.com/neomjs/neo/issues.
Once approved, sending a PR is also highly appreciated (an easy way to get into the contributors list).

In the long run, we are planning to convert as many of the rules as possible into linter specs.

## Content
1. General rules
2. Import statements
3. Neo className
4. Anatomy of a neo class / JS module
5. Config order
6. Formatting vdom
7. Container items
8. Class methods
9. data.Model fields
10. Misc


## 1. General rules
* (1) The neo.mjs code base follows the "easy to read for the human eye" paradigm.
* (2) A lot of the code is using block-formatting. Inside Jetbrains IDEs like WebStorm you can use the
`align: 'On colon'` setting.
* (3) Use single quotes over double quotes.
* (4) Never use more than 1 empty line.
* (5) For indentation, we are using 4 spaces (no tab chars).
* (6) A lot of items inside various spots are ordered chronologically.

## 2. import statements
```javascript
import Container           from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable    from './earthquakes/Table.mjs';
import GoogleMapsComponent from '../../../node_modules/neo.mjs/src/component/wrapper/GoogleMaps.mjs';
import Toast               from '../../../node_modules/neo.mjs/src/component/Toast.mjs';
import ViewController      from './MainViewController.mjs';
import ViewModel           from './MainViewModel.mjs';
```
* (7) Use block formatting. This makes it easy to spot invalid paths.
* (8) Use single quotes.
* (9) Imports get sorted by module name. There are ongoing discussions if we should switch to a path based sorting instead.
* (10) Feel free to rename module import names as needed. Neo classes are using the default export.

## 3. Neo className
Examples:
```
Neo.component.Base
Neo.data.Store
Neo.tab.header.Button
```
* (11) class names strictly follow the folder and file structure.
* (12) class names start with
  + your app name like `MyApp` which maps to `./apps/myapp`
  + or `Neo` which maps to `./src`
* (13) the first item is formatted in pascal-case or upper-case for abbreviations.
* (14) class names use dots => `.` instead of `/`, so it is important that you do not use dots within item names.
* (15) the last item (class file) is using pascal-case as well.
* (16) all items in between (folders) use lower-case syntax.
* (17) `ntype` is using lower-case syntax as well.

## 4. Anatomy of a neo class / JS module
```javascript
import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.button.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
    /**
     * Valid values for badgePosition
     * @member {String[]} badgePositions=['bottom-left','bottom-right','top-left','top-right']
     * @protected
     * @static
     */
    static badgePositions = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
    /**
     * Valid values for iconPosition
     * @member {String[]} iconPositions=['top','right','bottom','left']
     * @protected
     * @static
     */
    static iconPositions = ['top', 'right', 'bottom', 'left']

    static config = {
        /**
         * @member {String} className='Neo.button.Base'
         * @protected
         */
        className: 'Neo.button.Base',
        /**
         * @member {String} ntype='button'
         * @protected
         */
        ntype: 'button',
        /**
         * Change the browser hash value on click
         * @member {String|null} route_=null
         */
        route_: null,
        /**
         * True adds an expanding circle on click
         * @member {Boolean} useRippleEffect_=true
         */
        useRippleEffect_: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'button', type: 'button', cn: [
            {tag: 'span', cls: ['neo-button-glyph']},
            {tag: 'span', cls: ['neo-button-text']},
            {cls: ['neo-button-badge']},
            {cls: ['neo-button-ripple-wrapper'], cn: [
                {cls: ['neo-button-ripple']}
            ]}
        ]}
    }

    /**
     * Time in ms for the ripple effect when clicking on the button.
     * Only active if useRippleEffect is set to true.
     * @member {Number} rippleEffectDuration=400
     */
    rippleEffectDuration = 400
    /**
     * Internal flag to store the last setTimeout() id for ripple effect remove node callbacks
     * @member {Number} #rippleTimeoutId=null
     * @private
     */
    #rippleTimeoutId = null

    /**
     * Triggered after the route config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetRoute(value, oldValue) {
        let me = this;

        value && me.addDomListeners({
            click: me.changeRoute,
            scope: me
        });
    }

    /**
     * Triggered before the iconPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetIconPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'iconPosition');
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    getIconNode() {
        return this.getVdomRoot().cn[0];
    }
}

Neo.applyClassConfig(Base);

export default Base;

```
* (18) Use JSDoc based comments for all top level items as well as top level configs
* (19) Class content order:
  - static configs (ordered chronologically)
  - static config as the last item. This one does not need a comment, but is prefixed with an empty line.
  - non-static class fields (ordered chronologically)
  - construct() in case you are using it
  - all other class methods are ordered chronologically and are prefixed with an empty line.
* (20) Module order:
  - Import statements formatted according to 1.
  - empty line
  - class definition
  - empty line
  - Neo.applyClassConfig(<ClassName>)
  - empty line
  - export statement
  - empty line

## 5. Config order
```javascript
static config = {
    /**
     * @member {String} className='Neo.button.Base'
     * @protected
     */
    className: 'Neo.button.Base',
    /**
     * @member {String} ntype='button'
     * @protected
     */
    ntype: 'button',
    /**
     * Change the browser hash value on click
     * @member {String|null} route_=null
     */
    route_: null,
    /**
     * True adds an expanding circle on click
     * @member {Boolean} useRippleEffect_=true
     */
    useRippleEffect_: true,
    /**
     * @member {Object} _vdom
     */
    _vdom:
    {tag: 'button', type: 'button', cn: [
        {tag: 'span', cls: ['neo-button-glyph']},
        {tag: 'span', cls: ['neo-button-text']},
        {cls: ['neo-button-badge']},
        {cls: ['neo-button-ripple-wrapper'], cn: [
            {cls: ['neo-button-ripple']}
        ]}
    ]}
}
```
* (21) class content order
  + className first
  + ntype second (if used)
  + All other configs are ordered chronologically
  + _vdom last
  + configs use camel-case syntax
  + JSDoc comments are required
  + no empty lines between configs

## 6. Formatting vdom
```javascript
_vdom:
{tag: 'button', type: 'button', cn: [
    {tag: 'span', cls: ['neo-button-glyph']},
    {tag: 'span', cls: ['neo-button-text']},
    {cls: ['neo-button-badge']},
    {cls: ['neo-button-ripple-wrapper'], cn: [
        {cls: ['neo-button-ripple']}
    ]}
]}
```
The idea is to format the structure in a way that is similar to html tags and allows us to easily see the DOM hierarchy.

* (22) The vdom object starts inside a new line, to keep the structure intact plus keep us more space to the right side.
* (23) vdom Objects start with the `tag` property.
* (24) the `tag` property is not needed for `div` tags, since this is the default value.
* (25) All other attributes are ordered chronologically.
* (26) `cn` (child nodes) is always the last attribute.

There is a blog post which dives a bit deeper into this formatting strategy:</br>
https://itnext.io/new-formatting-concept-for-json-based-virtual-dom-ee52acc5e04a?source=friends_link&sk=94f69dc71f662e0027118052ceb2db38

## 7. Container items
```javascript
items: [HeaderContainer, {
    module     : TabContainer,
    activeIndex: null, // render no items initially
    flex       : 1,
    reference  : 'tab-container',
    sortable   : true,
    style      : {margin: '10px', marginTop: 0},
  
    items: [{
        module   : () => import('./TableContainer.mjs'),
        reference: 'table-container',
        header   : {
            iconCls: 'fa fa-table',
            route  : 'mainview=table',
            text   : 'Table'
        }
    }, {
        module: () => import('./mapboxGl/Container.mjs'),
        header: {
            iconCls: 'fa fa-globe-americas',
            route  : 'mainview=mapboxglmap',
            text   : 'Mapbox GL Map'
        }
    }]
}, FooterContainer]
```
Most arrays inside the neo.mjs code base use a compact formatting:
```javascript
items: [{
    // content
}, {
    // content
}, {
    // content
}]
```

It saves several lines of code compared to:
```javascript
items: [
    {
        // content
    },
    {
        // content
    },
    {
        // content
    }
]
```
(27) So, please stick to the first version.

Container items can contain:
* imported JS modules / neo classes
* neo instances
* config objects

(28) Config objects get formatted in the following way:
* Either `module`, `ntype` or `className` as the first item
* All other items sorted chronologically
* Exception: You can also sort everything which can get described in 1 line chronologically and use an empty
blank line afterwards. This "resets" the block formatting and order. Afterwards you can add "bigger" properties
like nested item arrays or complex objects (e.g. style). Each of those item starts with an empty line and they
do get sorted chronologically as well.

## 8. Class methods
```javascript

/**
 * @param {Object} data
 * @param {Neo.component.Base} data.component
 * @param {Number} data.rowHeight
 * @param {Number} data.rowsPerItem
 * @param {Number} data.totalHeight
 * @param {Boolean} [silent=false]
 */
adjustTotalHeight(data, silent=false) {
    let me          = this,
        rowHeight   = data.rowHeight,
        rowsPerItem = data.rowsPerItem,
        height      = data.totalHeight - rowHeight,
        i           = 0,
        gradient    = [];

    for (; i < rowsPerItem; i++) {
        gradient.push(
            `var(--c-w-background-color) ${i * rowHeight + i}px`,
            `var(--c-w-background-color) ${(i + 1) * rowHeight + i}px`,
            'var(--c-w-border-color) 0'
        );
    }

    Object.assign(me.getColumnContainer().style, {
        backgroundImage: `linear-gradient(${gradient.join(',')})`,
        backgroundSize : `1px ${rowsPerItem * rowHeight + rowsPerItem}px`,
        height         : `${height}px`,
        maxHeight      : `${height}px`
    });

    !silent && me.update();
}
```
* (29) Above every class method is one empty line
* (30) Each class method has JSDoc comments for the params
  + While doc commons support `@returns` & `@return`, we do stick to `@returns` (consistency)
* (31) Try to define most (if not all) variables at the top of the method body.
* (32) Variables do use block formatting
* (33) Variables are separated by commas (file size)
* (34) Create variables for every item which you use more than 2 times. (maintainability, readability & file size)
  + This rule also counts for `this`.
* (35) The framework source code is using `const` very(!) rarely. The only reason is the minified bundle size.

Example:
```javascript
let   a = 1;
const b = 2;
let   c = 3;
const d = 4;

// minified:
let a=1;const b=2;let c=3;const d=4; // 36 chars

let a = 1,
    b = 2,
    c = 3,
    d = 4;

// minified:
let a=1,b=2,c=3,d=4; // 20 chars
```

## 9. data.Model fields
```javascript
fields: [{
    name: 'active',
    type: 'Boolean'
}, {
    name: 'color',
    type: 'String'
}, {
    name: 'id',
    type: 'Integer'
}, {
    name: 'name',
    type: 'String'
}]
```
* (36) Compact array formatting (same as for container items)
* (37) Sorted by the value of the name property

## 10. Misc
* (38) prefer using maps instead of `switch` whenever possible.
* (39) `if (/**/) {` if, blank char, parenthesis, blank char, curly bracket
* (40) `for (/**/) {` for, blank char, parenthesis, blank char, curly bracket
* (41) `switch(/**/) {` switch, parenthesis, blank char, curly bracket `// could get changed to use a blank char as well
* (42) `while (/**/) {` while, blank char, parenthesis, blank char, curly bracket
* (43) Use optional chaining => `?.` where it makes sense
  + Bad: `myView && myView.myFn && myView.myFn();`
  + Good: `myView?.myFn?.();`
  + https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining
* (44) Use method definitions (meaning avoid using the term `function`)
  + Bad: `let obj = {a: function() {/**/}};`
  + Good: `let obj = {a() {/**/}};`
  + https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions
* (45) Use shorthand property names when possible
  + Bad: `let obj = {record: record}`
  + Good: `let obj = {record};`
  + https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#property_definitions
* (46) Do not use killing commas (while IE6 is luckily no longer an issue => file size)
  + Bad: `let obj = {a: 1,};`
  + Bad: `let arr = [1,];`
  + Good: `let obj = {a: 1};`
  + Good: `let arr = [1];`
