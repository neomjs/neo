Web-worker processes are automatically run in parallel, on separate CPU cores.

By contrast, other JavaScript frameworks run in a single thread, so all business logic, 
data handling, and DOM rendering compete for CPU resources.

This means Neo.mjs applications run and render faster. This is 
particularly beneficial for processor- and data-intensive applications, 
and applications that need to rapidly update what's viewed. In testing, Neo.mjs applications 
easily apply over 20,000 DOM updates per second. 

If the default four threads aren't enough, you're free to launch additional web-worker threads 
to run other specialized logic. 


<details>
<summary>Example</summary>
Look at this example. It's complex. As you pan left and right, and zoom in and out, the upper-right
shows you the number of delta updates being applied. If you move really quickly, you might reach 20,000 
or 30,000 delta updates per second. We've seen some examples that go over 40,000 updates per second &mdash;
but we've never actually hit the limit.

<a href="https://neomjs.com/node_modules/neo.mjs/examples/component/helix/index.html" target="_example">Helix Example</a>

<a href="https://neomjs.com/node_modules/neo.mjs/examples/component/helix/index.html" target="_example">
<img width="75%" src="https://s3.amazonaws.com/mjs.neo.learning.images/Helix.png"></img>
</a>
</details>