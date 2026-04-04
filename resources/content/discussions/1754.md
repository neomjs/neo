---
number: 1754
title: 'model.Component: support for methods inside binding formatters'
author: tobiu
category: Ideas
createdAt: '2021-04-12T15:49:27Z'
updatedAt: '2021-04-12T15:49:43Z'
---
To allow more complex logic inside the formatters, we can add methods into the mix.

Example:
"${this.formatters.formatDate(data)}"

There are a couple of open questions on my end on how to implement it in a smart way.

Scope: where should "this" point to?
I think using the scope of the closest view model makes the most sense.

Where should we store the formatting methods?
We could store methods inside each view model class extension.
To avoid overriding class methods, we could put those methods into a config, e.g. "formatters".

Now the fun starts:
Should it be possible to use methods inside parent view models as well?
This would reduce code redundancy. From a technical perspective we need to merge the formatters of the parent chain when accessing the object.

However, this would not solve the issue that you could want to use formatting methods, which are not inside the direct view model parent chain, e.g. inside a separate branch.

What we could do: once a vm class gets parsed, store formatters inside a global namespace like `Neo.model.formatters`. This would enforce that all formatter methods names are unique (or we need to throw an error).

The next big question is how to resolve binding data properties inside custom formatter methods.
We do want to refresh the binding value in case one of the affected data properties change.

We could call fn.toString() and try a regex parsing to find them. This could be tricky!
The other option would be that devs need to manually specify the related data properties for each method definition.

Thoughts?

Best regards,
Tobias
