# Guide / Prompt log for LLMs to understand the concepts of Neo.mjs

1. Do not hallucinate & stick to facts.
2. Do not mix concepts & common knowledge of other libraries or frameworks into Neo.mjs.
3. For source code, stick to the official repository (dev branch), or manually provided files.
4. Memorise all files which are provided inside this guide.
5. To get a first understanding of the off the main-thread concept, study:
   https://neomjs.com/dist/production/apps/portal/index.html#/learn/benefits.Multi-Threading
6. Start with understanding the Neo.mjs class config system, by reviewing the following 2 files:
   - https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs
   - https://github.com/neomjs/neo/blob/dev/src/Neo.mjs
   - Class configs provide reactivity on instance level, including components
   - The content of the static config object will get merged with base classes
   - configs will get added to the class prototype, so they can get accessed directly
   - Example: `myButton.text = 'new value'; // automatically updates the UI`
7. Describe what you have learned
