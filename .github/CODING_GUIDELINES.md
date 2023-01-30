# neo.mjs Coding Guidelines

Inside the neo repo the following coding guidelines are mandatory.
They ensure a high code quality and consistency.
We strongly recommend to also stick to them when creating your own workspaces and apps via `npx neo-app`.

In case you do find spots inside the neo.mjs code base which do not stick to the new guidelines,
you are very welcome to create a ticket here: https://github.com/neomjs/neo/issues.
Once approved, sending a PR is also highly appreciated (an easy way to get into the contributors list).

In the long run, we are planning to convert as many of the rules as possible into linter specs.

## Content
1. Import statements
2. Anatomy of a neo class / JS module
3. Config order
4. Formatting vdom


## 1. import statements
```javascript
import Container           from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable    from './earthquakes/Table.mjs';
import GoogleMapsComponent from '../../../node_modules/neo.mjs/src/component/wrapper/GoogleMaps.mjs';
import Toast               from '../../../node_modules/neo.mjs/src/component/Toast.mjs';
import ViewController      from './MainViewController.mjs';
import ViewModel           from './MainViewModel.mjs';
```
* Use block formatting. This makes it easy to spot invalid paths.
* Use single quotes.
* Imports get sorted by module name. There are ongoing discussions if we should switch to a path based sorting instead.
* Feel free to rename module import names as needed. Neo classes are using the default export.

## 2. Anatomy of a neo class / JS module
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
* Use JSDoc based comments for all top level items as well as top level configs
* Class content order:
  - static configs (ordered chronologically)
  - static config as the last item. This one does not need a comment, but is prefixed with an empty line.
  - non-static class fields (ordered chronologically)
  - construct() in case you are using it
  - all other class methods are ordered chronologically and are prefixed with an empty line.
* Module order:
  - Import statements formatted according to 1.
  - empty line
  - class definition
  - empty line
  - Neo.applyClassConfig(<ClassName>)
  - empty line
  - export statement
  - empty line

## 3. Config order
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
* className first
* ntype second (if used)
* All other configs are ordered chronologically
* _vdom last
* configs use camel-case syntax
* JSDoc comments are required
* no empty lines between configs

## 4. Formatting vdom
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
* The idea is to format the structure in a way that is similar to html tags and allows us to easily see the DOM hierarchy.
* The vdom object starts inside a new line, to keep the structure intact plus keep us more space to the right side.
* vdom Objects start with the `tag` property.
* the `tag` property is not needed for `div` tags, since this is the default value.
* All other attributes are ordered chronologically.
* `cn` (child nodes) is always the last attribute.

There is a blog post which dives a bit deeper into this formatting strategy:</br>
https://itnext.io/new-formatting-concept-for-json-based-virtual-dom-ee52acc5e04a?source=friends_link&sk=94f69dc71f662e0027118052ceb2db38


