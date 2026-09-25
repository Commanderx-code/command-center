# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **[Report a vulnerability](https://github.com/Commanderx-code/command-center/security/advisories/new)** (Security tab → *Report a vulnerability*). Don't open a public issue, discussion, or pull request for a security problem.

Include what you can:

- the Command Center version (Settings → About & updates) and your distribution;
- what an attacker controls and what they gain;
- steps to reproduce, or a proof of concept;
- any fix you'd suggest.

You'll get a reply in the private advisory. Once a fix is ready, it ships in a patch release, and the advisory is published with credit to you unless you'd rather stay anonymous. Please keep the details private until then.

## Supported versions

Security fixes go into the latest release only. Update to the newest version before reporting, and check whether the problem still occurs.

| Version | Supported |
|---|---|
| 0.7.x (latest) | ✅ |
| Older | ❌ |

## Scope

Command Center runs locally as your normal user, so the most important boundary is **untrusted data reaching the app**. Examples of in-scope problems:

- a repository, submodule, Git remote, or its output making the app run commands or misbehave without your review;
- a setup bundle or settings import changing what runs automatically or reading files it shouldn't;
- credentials or private data leaking to other local users, logs, Activity, or exports;
- a way around command review, so something runs that you didn't approve;
- problems in the release packages, the Arch recipe, or the CI workflows that build them.

Out of scope:

- actions that need someone already running code as your user, or with root;
- commands you reviewed and approved yourself;
- installer scripts from [Commander Toolbox](https://github.com/Commanderx-code/commander-toolbox): report those to that repository.
