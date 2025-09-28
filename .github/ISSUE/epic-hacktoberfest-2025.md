# Hacktoberfest 2025: Build Your AI Development Skills with Neo.mjs

**Status:** Pinned  
**Labels:** `hacktoberfest`, `epic`, `good first issue`, `help wanted`

## 🚀 Level Up Your Career in 5 Minutes

**Add these to your resume after Hacktoberfest:**
- ✅ AI-Augmented Development Experience
- ✅ Open Source Contributor to Production Framework
- ✅ Next-Gen JavaScript Architecture (Multi-threading, RAG Systems)
- ✅ Published Technical Content (if you write a blog post)

**Hacktoberfest starts October 1st** - Your competitive edge awaits!

## Choose Your Path - All Lead to Success

### Path 1: The Classic Contributor (No AI Setup Required)
Dive directly into the codebase and make a tangible impact. This path is perfect for developers of all skill levels who prefer a traditional workflow. Here are some high-impact ways to contribute:

- **Write High-Quality Documentation:** Good documentation is the backbone of a healthy open-source project. Help fellow developers by adding clear, intent-driven JSDoc comments to undocumented classes and methods in the `/src` directory. **Bonus:** Our AI-native system consumes these comments, so every piece of documentation you write also makes our AI assistant smarter.
- **Build New Examples:** Create a new, practical code example for any component in the `/examples` folder. This is one of the best ways to learn the framework and help others.
- **Strengthen the Codebase:** Add or improve unit tests for existing functionality.
- **Fix Bugs & Refactor:** Tackle an issue from our `good first issue` list or propose a refactoring to improve code quality.

### Path 2: AI-Powered Development (15-minute setup, then fly)
Let AI do the heavy lifting while you learn. The one-time setup takes about 15 minutes and leverages Google's generous free tier, which works in two parts:

- **Knowledge Base:** Building and querying the knowledge base uses the `text-embedding-004` model, which is free for up to **60 queries per minute**.
- **AI Agent:** For interactive development, if you use the Gemini CLI, it uses the `gemini-pro` model, which provides up to **3 million tokens per day for free**.

**1. Follow the [AI Knowledge Base Quick Start Guide](./AI_QUICK_START.md)**

This will walk you through building the local knowledge base that the AI uses to understand the project.

**2. Then, just chat with your AI:**
```bash
gemini
> "Help me find something to improve in Neo.mjs"
```

**The AI handles everything** - you just guide and learn!

### Path 3: Content Creator Route
Write about your experience, no coding required:
- Document your Hacktoberfest journey
- Review Neo.mjs from your perspective  
- Compare it to frameworks you know
- Share what you learned

**We especially value blog posts!** They help others learn.

## What Makes Neo.mjs Different (Optional Reading)

Neo.mjs is the first framework built for AI collaboration. While others bolt AI on top, we built it into our DNA.

**Want the full story?** Read "AI-Native, Not AI-Assisted" on [GitHub](https://github.com/neomjs/neo/blob/dev/learn/blog/ai-native-platform-answers-questions.md) or [Medium (friends link, no paywall)](https://itnext.io/ai-native-not-ai-assisted-a-platform-that-answers-your-questions-0c08f5a336ae?source=friends_link&sk=45cc238e4f342672d3eb3244136b7770) (or skip it and just start contributing!)

## Example Contribution Workflows

### Classic Contribution: Adding Documentation
This workflow shows how a classic contribution directly improves the codebase.

**Before:** An undocumented function.
```javascript
createVnode(vdom) {
    // complex logic here
}
```
**After:** Clear, intent-driven documentation is added.
```javascript
/**
 * Transforms a JSON blueprint into a virtual DOM node structure.
 * Part of Neo's reactivity system - enables surgical DOM updates.
 * @param {Object} vdom - JSON blueprint describing the UI component
 * @returns {Object} Virtual node ready for DOM rendering
 */
createVnode(vdom) {
    // complex logic here
}
```
*This documentation is now part of the knowledge base, making the AI smarter for the next contributor.*

### AI-Powered Contribution: Learning and Building
This workflow demonstrates using the AI as a pair programmer to learn and contribute simultaneously.
```bash
You: "Find me a component that needs better examples"
AI: "I found Neo.button.Split lacks examples. Let me explain what it does..."
You: "Create an example showing its features"
AI: [generates code]
You: "Explain how this works"
AI: [teaches you the concepts]
```

## Who Succeeds Here?

✅ **Complete Beginners** - "I learned more in one PR than a month of tutorials"  
✅ **Designers** - "I described a UI, AI built it, I learned how it works"  
✅ **Writers** - "My blog post about the experience got 500 views"  
✅ **Senior Devs** - "Finally saw how RAG works in production"  
✅ **Students** - "Added 'AI Development' to my internship applications"

**Only requirement:** Basic Git/GitHub (standard Hacktoberfest knowledge)

## Contribution Ideas by Time Investment

### Got 15 minutes?
- Fix a typo
- Add a missing JSDoc comment
- Improve an error message

### Got 30 minutes?
- Document a utility function
- Add an example to a component
- Write about your first impression

### Got 1 hour?
- Create a component demo
- Write a comparison blog post
- Migrate a test with AI help

### Got 2+ hours?
- Build a mini-app
- Deep dive into architecture
- Create a tutorial

## The Multiplier Effect

Your contribution doesn't just add code - it makes everyone after you more productive:
1. You document a function → AI can now explain it perfectly
2. You write a blog post → Next person learns faster  
3. You add an example → AI uses it to teach patterns
4. The ecosystem gets smarter → Everyone benefits

## Support When You Need It

**Stuck? We've got you:**
- **Slack:** [Instant help](https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA)
- **Discord:** [Instant help](https://discord.gg/6p8paPq)
- **AI Assistant:** Your AI can answer any Neo.mjs question

## Start Contributing NOW

### 🎯 Fastest Start (2 minutes)
```bash
# Find any file, add any comment, make any improvement
git clone https://github.com/neomjs/neo.git
cd neo
# Browse /src, find something unclear, clarify it
```

### 🤖 AI-Powered Start (15 minutes)
Set up once following the **[AI Knowledge Base Quick Start Guide](./AI_QUICK_START.md)**, then the AI guides everything.
```bash
gemini  # or your preferred AI tool
> "Guide me through my first Neo.mjs contribution"
```

### ✍️ Writer's Start (0 setup)
- Fork the repo
- Create a file in `/learn/blog/`
- Write about why you chose Neo.mjs for Hacktoberfest
- Submit PR

## Look for These Labels

`hacktoberfest` - Counts for the event  
`good first issue` - Great starting points  
`documentation` - No coding required  
`blog-post` - Content needed  
`help wanted` - Where we need you most

## Why This Matters for Your Career

Companies are desperately seeking developers who can work with AI effectively. By contributing to Neo.mjs, you're not just adding to open source - you're building proof of your ability to:

- Collaborate with AI systems
- Understand modern architectures
- Contribute to production codebases
- Communicate technical concepts

**This experience sets you apart in job interviews.**

---

**Remember:** Every PR is a learning opportunity. Every comment makes the framework smarter. Every blog post helps someone else.

Join us. The future of development is being written right now.

**Neo.mjs: Where your contributions compound into everyone's success.**
