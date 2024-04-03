To code a live preview, enclose the code in a `pre` tag with the `data-neo` attribute.

<code>&lt;pre data-neo>...&lt;/pre&gt; &lt;</code> 

Imports are relative to the portal app running within the framework. That means
Neo.mjs imports should be coded to go up four levels, then look into the `src`
directory. For example, to import _container_, use `import Base from '../../../../src/container/Base.mjs`

You can define as many classes you need, such as component models and controllers, but the the _last_
class being defined is assumed to be the view being rendered. In other words, if the final class definition is a component, it's rendered.

<pre data-neo>
import Base from '../../../../src/container/Base.mjs';
import Button from '../../../../src/button/Base.mjs';
import Split from '../../../../src/button/Split.mjs';
class Bar extends Base {
    static config = {
        ntype: 'demoFoo',
        className: 'Foo.Bar',
        layout: {ntype: 'hbox'},
        items: [{
            module: Button,
            text: 'Button One'
        },{
            module: Button,
            text: 'Button Two'
        }]
    }
}
Neo.setupClass(Bar);
</pre>
