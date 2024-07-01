The Neo.mjs web-worker processes are automatically run in parallel, on separate CPU cores.

By contrast, other JavaScript frameworks run in a single thread, so all business logic, 
data handling, and DOM rendering compete for CPU resources.

This means Neo.mjs applications run and render faster. This is 
particularly beneficial for processor- and data-intensive applications, 
and applications that need to rapidly update what's viewed. In testing, Neo.mjs applications 
easily apply over 20,000 DOM updates per second. 

If the default four threads aren't enough, you're free to launch additional web-worker threads 
to run other specialized logic. 


<details><summary>Example</summary>

Take a look at this example. It's the `Neo.component.Helix` component. Besides looking cool, it illustrates how quickly Neo.mjs can update a complex user interface. 

Click on Preview, then use your mouse or trackpad to pan and zoom &mdash; the helix zooms and spirals accordingly, very very rapidly. 
If you move quickly, you might reach 20,000 or 30,000 delta updates per second. We've seen some examples that go over 40,000 updates per 
second &mdash; but we've never actually hit the limit.

<pre data-neo>
import Base from '../container/Base.mjs';
import Helix from '../component/Helix.mjs';
class Foo extends Base {
    static config = {
        className: 'Foo',
        layout: 'fit',
        items: [{
            module: Helix,
            imageField : 'image',
            imageSource: '../../../../resources/examples/',
            store: {
                autoLoad: true,
                model: {
                    fields: [ { name: 'image' , type: 'String'   } ],
                },
                url: '../../../../resources/examples/data/ai_contacts.json'
            }
        }]
    }
}
Neo.setupClass(Foo);
</pre>


If you're interested, there's <a href="../../examples/component/helix/index.html" target="_blank">a more full-featured helix example</a> that includes showing delta updates, 
along with some other control. Look at the upper-right corner to see delta updates.

</details>
