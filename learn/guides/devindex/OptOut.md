# Privacy and Opt-Out Options

The **DevIndex** application is built entirely upon publicly available data provided by the GitHub API. We strictly aggregate and analyze metrics that are already visible on developers' public profiles, such as star counts, follower counts, and public contribution graphs.

Despite the data being public, we deeply respect user privacy and adhere to the principles of data minimization and the "right to be forgotten" (in alignment with strict privacy frameworks like the GDPR).

If you do not wish to be included in the DevIndex, we provide two distinct, automated mechanisms to opt out. Once an opt-out is processed, your data is permanently removed from our active database and you are added to a blocklist to ensure you are not re-indexed by our discovery systems.

## The Importance of Identity Verification (No Email Requests)
Please note that we **cannot accept opt-out requests via email or direct messages**. From a legal and privacy standpoint, it is unlawful to remove or modify someone's data without their explicit, verified consent. If someone emailed us requesting the removal of an account using an email address different from the one on the GitHub profile, we would have no secure way to verify if the request is genuine or a malicious attempt to censor another developer. 

By using the automated methods below (temporarily starring a repository or opening an issue), GitHub automatically authenticates you. Because you must be logged into the account you wish to remove, cryptographic identity verification is guaranteed.

---

## Option 1: The "Stealth" Star-Based Opt-Out (Privacy-First)

For maximum anonymity and ease of use, you can opt out simply by temporarily starring a dedicated repository. This method ensures your identity is verified without requiring you to leave a permanent, public trace (like creating an issue). **This is absolutely not a "star gathering" mechanism; we explicitly encourage you to remove your star once your opt-out is processed.**

### How it works:
1. **Star the Repository**: Navigate to [neomjs/devindex-opt-out](https://github.com/neomjs/devindex-opt-out) and click the "Star" button.
2. **Automated Processing**: Our backend pipeline runs every hour. It queries the GraphQL API to find new stargazers on this repository.
3. **Removal**: When our pipeline detects your star, it automatically:
    - Adds your GitHub username to our internal blocklist.
    - Removes your profile from our rich data store (`users.jsonl`).
    - Purges you from our discovery tracking files.
4. **Un-star (Highly Encouraged)**: After an hour or two, you are free to un-star the repository. The removal is permanent, and you will not be re-indexed even if you remove the star.

This approach is entirely automated, requires zero manual interaction with the maintainer, and keeps your public GitHub activity clean of administrative issues.

---

## Option 2: The Issue-Template-Based Opt-Out (Public Audit Log)

If you prefer to have a concrete, verifiable record that your opt-out request was processed, you can use our automated issue template. This acts as a "Public Audit Log" while still ensuring your data is swiftly removed from our active systems.

### How it works:
1. **Create an Issue**: Navigate to [neomjs/devindex-opt-out](https://github.com/neomjs/devindex-opt-out/issues/new/choose) and select the **"DevIndex Opt-Out Request"** template.
2. **Confirm**: The template provides a simple checkbox acknowledging that you understand you will be removed from the DevIndex (with the option to opt back in later if desired). Submit the issue.
3. **Automated Processing**: Our backend pipeline runs every hour and scans for open issues with the `devindex-opt-out` label. Because you must be logged into GitHub to create the issue, the pipeline automatically verifies your identity as the issue author.
4. **Removal and Confirmation**: The pipeline automatically:
    - Adds your GitHub username to our internal blocklist.
    - Removes your profile from our rich data store (`users.jsonl`).
    - Purges you from our discovery tracking files.
    - Leaves an official, automated comment on your issue confirming the removal.
    - **Automatically closes the issue.**

**Privacy Warning:** Unlike the "Stealth" Star-Based option, this issue will remain visible in the repository's history as a closed ticket. If you prefer a completely stealth option with zero public trace, please use **Option 1** instead.
