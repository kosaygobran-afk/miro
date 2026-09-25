# Multi-Agent Development Architecture

The primary model is the LEAD ARCHITECT and FINAL REVIEWER.

The primary agent is responsible for:
- understanding the user's real objective;
- inspecting the existing codebase before deciding on changes;
- identifying root causes rather than treating symptoms;
- designing the implementation;
- dividing independent work between subagents;
- integrating and reviewing all results;
- making the final technical decision.

## Delegation

For any substantial feature, bug, refactor, investigation, or
multi-file task:

1. Analyze the problem yourself first.

2. Determine:
   - root cause;
   - relevant architecture;
   - affected files;
   - dependencies;
   - risks;
   - required tests.

3. Separate independent work into focused tasks.

4. Prefer AgentSwarm whenever at least two useful tasks can be
   performed independently.

5. Use subagents for implementation, investigation, testing,
   debugging, review, and other focused work.

6. Give every subagent a precise task containing:
   - objective;
   - relevant files or subsystem;
   - constraints;
   - expected result;
   - verification requirements.

7. Avoid assigning multiple agents to edit the same file
   simultaneously unless necessary.

## Main-agent responsibility

Subagents are workers. They are not the final authority.

After workers return, the primary agent MUST personally:

1. inspect their results;
2. inspect every relevant changed file;
3. inspect git diff;
4. check integration between changes;
5. verify architectural correctness;
6. detect duplicated or conflicting implementations;
7. run appropriate validation.

For a JavaScript / TypeScript / Next.js project, determine which
scripts actually exist and run appropriate checks such as:

- type checking;
- linting;
- tests;
- production build.

Do not claim success merely because a subagent says its task
succeeded.

## Correction loop

If a worker result is incomplete or incorrect:

1. identify the exact problem;
2. explain why it is incorrect;
3. resume or launch the responsible subagent;
4. give precise correction instructions;
5. wait for the correction;
6. personally review it again;
7. rerun relevant verification.

Repeat until the integrated result is correct.

## Parallel investigation

For difficult bugs, use multiple independent agents when useful,
for example:

- one investigates frontend/UI behavior;
- one investigates backend/database behavior;
- one investigates existing architecture or call flow;
- one reviews tests or regressions.

The primary agent must compare their findings and decide which
explanation is actually supported by the repository.

## Final approval

Only the primary agent may declare the task complete.

Before completion, confirm:
- requested behavior is implemented;
- implementation matches existing architecture;
- no obvious regression was introduced;
- build/tests/type checks appropriate to the project pass;
- unfinished or uncertain parts are explicitly reported.

For trivial changes, spawning subagents is optional.

For substantial work, delegation and independent verification are
preferred.

