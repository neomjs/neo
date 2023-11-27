Neo.mjs is multi-threaded. There are app worker threads
that handle data access, application logic,
and keeping track of DOM updates. Practically all your
application logic is run in parallel in these threads.
However, anything that needs to actually reference or update
the DOM, or use the `window` object, must be done in the main 
application thread. 

That's the purpose of main thread addons. These are classes whose
methods can be accessed from other web workers, but are
actually executed in the main thread.

For example, what if you needed to read the browser's
URL? That information is in `window.location`.
But `window` is a main thread variable! To access that
from a web-worker our code has to say "hey main thread, 
please return a specified `window` property." Neo.mjs
lets you do that via `Neo.Main.getByPath()`. For
example, the following statement logs the URL query string.


<pre data-javascript>
Neo.Main.getByPath('window.location.search')
    .then(value=>console.log(value)); // Logs the search string
</pre>

`Neo.Main` has some simple methods for accessing the 
main thread, but for something with a non-trivial API
you'd use a _main thread addon_. 

Google Maps is a good example of this. In Neo.mjs, most
views are responsible for updating their own vdom, but
the responsibility for rendering maps and markers is handled
by Google Maps itself &mdash; we _ask_ Google Maps to do
certain things via the Google Maps API. Therefore, in Neo.mjs,
Google Maps is implemented as a main thread addon which
loads the libraries and exposes whatever methods we'll need
to run from the other Neo.mjs threads. In addition, in a
Neo.mjs application we want to use Google maps like any other
component, so Neo.mjs also provides a component wrapper. In
summary: 
- The main-thread addon contains the code run in the main thread,
and exposes what methods can be run by other web-workders,
and
- The component wrapper lets you use it like any other component,
internally calling the main thread methods as needed.
