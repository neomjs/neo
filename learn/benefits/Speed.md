# Extreme Speed

The Neo.mjs architecture leverages web workers to run application logic, data processing,
and even parts of the rendering pipeline in parallel, on separate CPU cores.
This offloads heavy computations from the main thread, ensuring the UI remains responsive.

By contrast, most other JavaScript frameworks operate predominantly within a single main thread.
This means all business logic, data handling, and DOM rendering compete for the same CPU resources,
often leading to a "janky" or unresponsive user interface during intensive operations.

This multi-threaded approach allows Neo.mjs applications to run and render significantly faster.
This is particularly beneficial for processor- and data-intensive applications, as well as those
requiring rapid UI updates. In internal testing, Neo.mjs applications have consistently
demonstrated the ability to easily apply over 20,000 DOM updates per second without
compromising user experience.

Should your application demand even greater parallel processing power, Neo.mjs provides the
flexibility to launch additional web worker threads to handle specialized logic or
further distribute computational load. 


<details><summary>Example</summary>

Take a look at this example. It's the `Neo.component.Helix` component. Besides looking cool, it illustrates how quickly Neo.mjs can update a complex user interface. 

Click on Preview, then use your mouse or trackpad to pan and zoom &mdash; the helix zooms and spirals accordingly, very very rapidly. 
If you move quickly, you might reach 20,000 or 30,000 delta updates per second. We've seen some examples that go over 40,000 updates per 
second &mdash; but we've never actually hit the limit.

```javascript live-preview
import Container from '../container/Base.mjs';
import Helix     from '../component/Helix.mjs';

class MainView extends Container {
    static config = {
        className: 'Benefits.speed.MainView',
        layout   : 'fit',
        items    : [{
            module     : Helix,
            imageField : 'image',
            imageSource: '../../../../resources/examples/',
            store: {
                autoLoad: true,
                model: {
                    fields: [{name: 'image', type: 'String'}],
                },
                url: '../../../../resources/examples/data/ai_contacts.json'
            }
        }]
    }
}
MainView = Neo.setupClass(MainView);
```


If you're interested, there's <a href="../../examples/component/helix/index.html" target="_blank">a more full-featured helix example</a> that includes showing delta updates, 
along with some other control. Look at the upper-right corner to see delta updates.

</details>
