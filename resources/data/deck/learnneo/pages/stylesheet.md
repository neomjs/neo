<details>
<summary>Training material advice</summary>
Training content is different than self-study content. 
Training material _augments_ the lecture. The audience should be focused on what the speaker is
saying; the slides support the lecture. An important concept in writing
training material is to avoid a _wall of words_, where there are lengthy
paragraphs. People will read what's in front of them. If you have a lecture slide
with a lot of text, your audience will be reading while you are lecturing, 
and information is lost.
</details>


# This is an h1
## This is an h2
### This is an h3
#### This is an h4

<br>

To show highlighted Neo.mjs source code use
&lt;pre data-javascript>
// Source code goes here
&lt;/pre>

<pre data-javascript>
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal'
    }
}
</pre>

For short in-line statements of code use &lt;code> or backticks.

When definining variables avoid `var` &mdash; use `let` or `const` instead.

<br>

For expandable bullet points and lab steps use a &lt;details> tag 
<pre>
&lt;details>
&lt;summary>This describes the item&lt;/summary>
This is the item contents.
&lt;/details>
</pre>

<details>
<summary>This describes the item</summary>
This is the item contents.
</details>

<pre data-neo>
let a = 1;
</pre>

