# Privacy and Opt-Out Options

The **DevIndex** application is built entirely upon publicly available data provided by the GitHub API. We strictly aggregate and analyze metrics that are already visible on developers' public profiles, such as star counts, follower counts, and public contribution graphs.

Despite the data being public, we deeply respect user privacy and adhere to the principles of data minimization and the "right to be forgotten" (in alignment with strict privacy frameworks like the GDPR).

If you do not wish to be included in the DevIndex, we provide two distinct, automated mechanisms to opt out. Once an opt-out is processed, your data is permanently removed from our active database and you are added to a blocklist to ensure you are not re-indexed by our discovery systems.

---

## Option 1: The "Stealth" Star-Based Opt-Out (Privacy-First)

For maximum anonymity and ease of use, you can opt out simply by starring a dedicated repository. This method ensures your identity is verified (since you must be logged into GitHub to star the repository) without requiring you to leave a permanent, public trace (like creating an issue).

### How it works:
1. **Star the Repository**: Navigate to [neomjs/devindex-opt-out](https://github.com/neomjs/devindex-opt-out) and click the "Star" button.
2. **Automated Processing**: Our backend pipeline runs every hour. It queries the GraphQL API to find new stargazers on this repository.
3. **Removal**: When our pipeline detects your star, it automatically:
    - Adds your GitHub username to our internal blocklist.
    - Removes your profile from our rich data store (`users.jsonl`).
    - Purges you from our discovery tracking files.
4. **Un-star (Optional)**: After an hour or two, you are free to un-star the repository. The removal is permanent, and you will not be re-indexed even if you remove the star.

This approach is entirely automated, requires zero interaction with our team, and keeps your public GitHub activity clean of administrative issues.

---

## Option 2: The Issue-Template-Based Opt-Out (Coming Soon)

*(This feature is currently under active development.)*

In the near future, we will also provide an explicit issue-based opt-out mechanism. Users will be able to navigate to our deployment repository (`neomjs/pages`) and create a new issue using a specific "Opt-Out" template.

To maintain your privacy, the pipeline will be designed to automatically process the request, apply the blocklist logic, and then immediately close (and potentially delete) the issue so that it does not remain as a permanent public association.

*Detailed instructions for this method will be provided here once the feature is live.*
