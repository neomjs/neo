In this lab you'll get a little debugging practice by getting component references, changing properties,
and runing methods.

Remember that when using the debugger console you need to be in the _neo-app-worker_ context.

<details>
<summary>Use `Neo.manager.Component.items`</summary>

While running the _earthquakes_ app, open Chrome devtools, choose the _neomjs-app-worker_ JavaScript
context, and run this statement:

    Neo.manager.Component.items

The `items` property is an array of all created components. The array may have a lot of entries, depending on
the complexity of an app and how much you've done while running it. But it's an easy way to explore what's
been created.

</details>

<details>
<summary>Store as global variable</summary>

Any time you have a object reference in the console &mdash; even if it's nested within an array or object &mdash;
you can right click on the object and choose _Store as global_ variable. Chrome will create a variable named
`temp1`, `temp2`, etc., that references the object. That  can make it easier to inspect the object and run its methods..


<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/StoreAsGlobal.png" style="width:80%"/>

</details>


<details>
<summary>Use `Neo.find()` and `Neo.findFirst()`</summary>

If you know what you're looking for, and don't want to bother inspecting everything in `Neo.manager.Component.items`,
you can use `Neo.find()`, passing an object used to match against what you're searching for.

`Neo.find()` returns an array of matching instances, and `Neo.findFirst()` returns the first matching item.
Often you know there's only a single instance, so in practice `Neo.findFirst()` is more commonly used.

You could find the button via Neo.find({ntype:'button'}) or Neo.find({text:'Button!'} (assuming you haven't changed
the button's text.) You can even match a property you give the button. For example, if you configured it with a made-up
property `foo:true`, you could find it via `Neo.findFirst({foo:true})`. The point is you can search for any properties
you'd like.

Try this out.

`Neo.findFirst({text:'Button!'}).text = 'Foo!'

You should see the button's text change immediately.

</details>


<details>
<summary>Use `Shift-Ctrl-right-click`</summary>

With your cursor over the button, press _Shift-Ctrl-right-click_. The console will log the button, its parent `MainView`
and the subsequent parent `Viewport. The button reference shows up as `Base` because the button class name is `Neo.button.Base`.

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesDemoShiftCtrl.png">

Note that _Shift-Ctrl-right-click_ is only available during development &mdash; it isn't available in a build.

</details>


<details>
<summary>Add a method</summary>

As we mentioned, when debugging, if you a have a reference you can access or update its properties, or run
its methods. Let's try that out by adding a method.

Edit `apps/earthquakes/view/MainView.mjs` and add a method.

<pre data-javascript>

import Base       from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button     from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Controller from './MainViewController.mjs';
import ViewModel  from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {
            ntype: 'vbox',
            align: 'start'
        },
        items: [{
            module: Button,
            foo: true,
            text: 'Button!'
        }],
    }
    doFoo() {
        console.log('foo!');
    }
}

Neo.setupClass(MainView);

export default MainView;
</pre>

Save your changes.

As you can see, the code defined an instance method `doFoo()` that simply logs a message. We'll run the method via debugging techniques in the next step.

</details>

<details>
<summary>Use `Neo.component.Manager.items` to run the method</summary>

On the console run `Neo.component.Manager.items`. Expand the array and right-click on the entry for `MainView` and
choose `Store object as global variable`. Then type `temp1.doFoo()` &mdash; you should see "foo!" being logged.

Remember that you _must_ run console statement in the _neomjs-app-worker_ context, and every time your choose
`Store object as global variable` it'll increment the name of the temp variable: `temp1`, `temp2`, etc.
</details>

<details>
<summary>Use _Shift-Ctrl-right-click_ to run the method</summary>

Now try the _Shift-Ctrl-right-click_ technique.

With your cursor over the button, do a _Shift-Ctrl-right-click_ &mdash; you'll see the component hierarchy logged.
As you did in the previous step, right-click on the entry for `MainView` and choose `Store object as global variable`.
Then run `doFoo()` using that variable.
</details>
