Controllers often need to get references to components in order to update 
the UI or access component properties. 
There are two common ways of doing that:

- Using the component references passed to the event handler
- Tagging a component with a `reference` and using `this.getReference()` in the controller

Here's an example with one button. Clicking on the button will disable it. 
As you can see, the handler uses the component reference pass in via `data.component`.

<pre data-neo>
import Base        from  '../../../../src/container/Base.mjs';
import Controller  from  '../../../../src/controller/Component.mjs';
import Button      from   '../../../../src/Button/Base.mjs';

class MainViewController extends Controller {
    static config = {
        className: 'Example.view.MainViewController'
    }
    onDisableButtonClick(data){
        data.component.disabled = true;
    }
}
Neo.applyClassConfig(MainViewController);


class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        controller: MainViewController,
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: Button,
            text: 'Disable this button',
            handler: 'onDisableButtonClick'
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>

But what if we need to get a reference to another component in the view? In that case
you tag the component you need with a `reference` config, then use `getReference()` in
the controller.

<pre data-neo>
import Base        from  '../../../../src/container/Base.mjs';
import Controller  from  '../../../../src/controller/Component.mjs';
import Button      from   '../../../../src/Button/Base.mjs';

class MainViewController extends Controller {
    static config = {
        className: 'Example.view.MainViewController'
    }
    onDisableButtonClick(data){
        data.component.disabled = true;
    }
    onEnableButtonClick(data){
        this.getReference('myButton').disabled = false;
    }
}
Neo.applyClassConfig(MainViewController);


class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        controller: MainViewController,
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: Button,
            reference: 'myButton',
            text: 'Disable this button',
            handler: 'onDisableButtonClick'
        }, {
            module: Button,
            text: 'Enable the other button',
            handler: 'onEnableButtonClick'
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>


There are other ways of getting references, but these are either non-standard or for debugging.
For example, components have an `up()` method, and containers have a `down()` method. These look 
up or down the containment hierarchy to find the specified component. Using these methods is poor technique
becuse it violates principles of encapsulation and limiting scope.

There are also debugging methods, such as `Neo.findFirst()` which will find any component matching
the search param. 

When you're debugging it's pretty handy to be able to inspect or interact with any component in the app. 
But app logic should never use `Neo.findFirst()` and very rarely use `up()` or `down()`.

The following example gets a reference to the _Learn_ button at the top of this site, and changes its `text`.
Again &mdash; that use of `Neo.findFirst()` might be handy when debugging, but it should never be used in app logic.

<pre data-neo>
import Base        from  '../../../../src/container/Base.mjs';
import Button      from   '../../../../src/Button/Base.mjs';

class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: Button,
            text: 'Change Learn caption',
            handler: data=>{
                const component = Neo.findFirst({text:'Learn'});
                if (component) component.text = 'Yikes!';
            }
        }, {
            module: Button,
            text: 'Restore Learn caption',
            handler: data=>{
                const component = Neo.findFirst({text:'Yikes!'});
                if (component) component.text = 'Learn';
            }
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>