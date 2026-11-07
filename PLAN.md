# GraphOM --- Agent Refactor & Implementation Master Plan

**Status:** Proposed execution brief\
**Project:** Rename and evolve `metal` into **GraphOM** (`graph-om` for
repository/CLI naming where appropriate)\
**Primary implementation target:** Existing Metal TypeScript/Neo4j
repository\
**Audience:** Coding agents (Codex, Claude Code, Cursor, VS Code agents)
and the human project owner\
**Core rule:** Audit the repository first. This document is a
target-state plan, not proof that any proposed capability already
exists.

------------------------------------------------------------------------

## 0. Mission for the coding agents

Transform the existing Metal project into **GraphOM**, a
TypeScript-first graph development and verification platform, initially
focused on Neo4j.

GraphOM must help developers and coding agents:

1.  Understand an existing graph and its application contracts.
2.  Model graph structure and business invariants.
3.  Generate reliable, type-safe application operations.
4.  Detect schema drift and data-integrity problems.
5.  Plan and execute safe graph migrations.
6.  Inspect query behavior and performance.
7.  Test graph-specific invariants.
8.  Integrate with agentic coding workflows so generated changes can be
    checked before they ship.

**Product positioning**

> GraphOM --- The graph engineering and verification platform for
> developers and AI coding agents.

Suggested tagline: **Build with confidence. Evolve without fear.**

The differentiator is not "an AI chatbot for Neo4j" or "another ORM." It
is the combination of a canonical graph contract, diagnostics,
impact-aware migrations, query intelligence, graph-aware tests and
agent-facing verification.

### Non-negotiable execution rules

-   Do not assume the current repository structure, APIs, package
    boundaries or implementation status. Inspect first.
-   Do not perform a wholesale rewrite merely to match this document.
-   Preserve working behavior unless there is a documented reason to
    change it.
-   Prefer incremental, testable refactors over speculative
    architecture.
-   Do not introduce a package for every feature prematurely. Begin with
    the existing project structure or a monorepo boundary that is
    justified by actual dependencies.
-   Do not claim a feature is complete because a stub, interface, mock
    or documentation page exists.
-   Never run destructive database operations against a production or
    unknown database.
-   Diagnostics are read-only by default. Migrations and repairs require
    explicit plans and approval.
-   AI agents may propose changes; GraphOM must validate them; a human
    or explicitly authorized pipeline approves risky execution.
-   Distinguish static analysis from database-backed measurements. Never
    present estimates as actual Neo4j execution statistics.
-   Add tests and documentation with every behavior change.
-   Keep the project runnable at each meaningful milestone.

------------------------------------------------------------------------

## 1. Product thesis and scope

### 1.1 The problem

Graph databases are flexible, but that flexibility can make application
structure difficult to understand and enforce over time. Graph
application concerns are often split between TypeScript types, query
code, database constraints, migration scripts, tests, operational
dashboards and developer knowledge.

The initial research in the supplied strategy document identified
adjacent-ecosystem evidence for: - Difficulty maintaining enforceable
agreements around flexible graph schemas. - Risk and complexity in graph
schema evolution and data integrity. - Potential memory/performance
problems from nested graph query patterns. - Configuration mistakes that
may surface only at query time. - Type inference and generated
declaration challenges in TypeScript ORM ecosystems. - Transaction
timeout, rollback and failure-handling complexity.

**Evidence limitation:** These are observations from adjacent graph and
ORM ecosystems, not validated customer research for Metal/GraphOM. The
supplied research stated that Metal itself had no open GitHub issues and
very limited visible adoption signals at the time of inspection. Treat
the pain points as hypotheses to validate, not proven demand.

### 1.2 Product pillars

1.  **Graph integrity:** Know whether the graph conforms to declared
    structural and logical rules.
2.  **Safe evolution:** Understand the impact of schema and relationship
    changes before deployment.
3.  **Query intelligence:** Understand generated queries, identify risky
    patterns and inspect actual execution plans.
4.  **Excellent TypeScript developer experience:** Type-safe APIs,
    reliable compiler behavior, testing and intuitive graph operations.
5.  **Agent verification:** Give coding agents authoritative project
    context and deterministic ways to validate proposed graph changes.

### 1.3 Explicit non-goals for the initial release

Do not prioritize: - Another generic CRUD abstraction without a clear
advantage. - A built-in GraphQL server; integrate with existing
frameworks/libraries instead. - A generic REST generator. - Multiple
database drivers before Neo4j support is reliable. - An AI chatbot with
no deterministic graph-development workflow. - A huge query-operator
surface without user demand. - A complex visual editor before contracts,
diagnostics and migrations work. - A bespoke dashboard for every
operational concern. - Becoming a complete application framework.

------------------------------------------------------------------------

## 2. Existing ecosystem and competitive discipline

The product must integrate with, not needlessly duplicate, existing
tools.

Relevant alternatives and adjacent capabilities identified during the
strategy discussion include:

-   **Neo4j GraphQL Library:** schema-driven GraphQL APIs, CRUD,
    relationships, filtering, sorting and pagination. Do not position
    generated CRUD or typed graph access alone as unique.
-   **Neo4j MCP Server:** agent access to Neo4j tools and database
    operations. Do not build a thin MCP wrapper that merely repeats
    database access.
-   **Neo4j Agent Skills:** coding-agent guidance for Neo4j, Cypher,
    modeling, indexing and profiling. GraphOM must provide
    project-specific contracts, change analysis and verification beyond
    generic instructions.
-   **Neo4j native tooling:** schema inspection, constraints, indexes,
    `EXPLAIN`, `PROFILE` and driver capabilities should be reused where
    appropriate.

Competitive validation must be ongoing. Verify current documentation,
releases, repositories and issue trackers before claiming that a
capability is missing from a competitor. Distinguish verified facts from
interpretation.

**Strategic hypothesis:** GraphOM's potential advantage is making
AI-generated graph application changes verifiable, safe and consistent
with both the declared contract and the live database.

------------------------------------------------------------------------

## 3. Target architecture

### 3.1 Canonical GraphOM Schema IR

Create or identify one canonical, versioned **GraphOM Schema
Intermediate Representation (IR)**. It should be the shared source
consumed by:

-   TypeScript types and client generation.
-   Compiler and query validation.
-   Graph Doctor diagnostics.
-   Schema introspection and drift comparison.
-   Migration diff and impact analysis.
-   Graph invariant tests.
-   Studio visualization.
-   Agent context and MCP resources.

Do not create separate, drifting schema models for each subsystem.

The IR should represent, as supported by the existing product and
Neo4j: - Node labels / model identities. - Properties, types,
optionality and defaults. - Relationship types, direction and
source/target model identities. - Uniqueness, existence and other
supported constraints. - Index definitions. - Application-level
invariants that cannot be expressed as native database constraints. -
Schema version / provenance and source location where available.

Keep a clear distinction between: 1. **Declared contract** --- what the
application expects. 2. **Database capabilities** ---
constraints/indexes the database actually supports. 3. **Observed graph
state** --- what exists in live data. 4. **Application invariants** ---
logical rules that may require queries or tests to verify.

Do not imply that a TypeScript type enforces the database or that a
database constraint enforces every business invariant.

### 3.2 Logical layers

**Developer Experience** - TypeScript API and generated types. - CLI. -
Agent Skills, MCP and agent instructions. - Studio (later).

**Graph Intelligence** - Contract validation. - Graph Doctor and drift
detection. - Migration planning and impact analysis. - Query static
analysis and database-backed plan inspection. - Graph-aware tests.

**Graph Engine** - Schema IR. - Compiler / AST / Cypher generation. -
Query execution abstractions. - Runtime validation. - Transaction and
result hydration behavior.

**Database Infrastructure** - Neo4j driver integration. - Neo4j
constraints and indexes. - Database introspection. - Observability and
telemetry.

### 3.3 Package strategy

The previous strategy proposed these eventual logical packages:

-   `@graphom/core`
-   `@graphom/compiler`
-   `@graphom/neo4j`
-   `@graphom/validation`
-   `@graphom/cli`
-   `@graphom/migrate`
-   `@graphom/doctor`
-   `@graphom/testing`
-   `@graphom/query-inspector`
-   `@graphom/studio`
-   `@graphom/observe`
-   `@graphom/ai`
-   `@graphom/mcp`

These are **candidate boundaries, not a mandate to create thirteen
packages now**. First map the existing four-package architecture and
dependency graph. Keep the compiler isolated and well-tested. Extract
packages only where build, API, dependency or release boundaries justify
them.

Use the existing repository's package manager, build system, test
framework and conventions unless the audit demonstrates a concrete
reason to change them.

### 3.4 Naming and compatibility

-   Product name: **GraphOM**.
-   Repository/CLI convention: `graph-om` / `graphom`, chosen
    consistently after checking current repository and npm naming
    constraints.
-   Proposed package scope: `@graphom/*`, subject to availability and
    ownership verification.
-   Plan a compatibility path from `metal` to GraphOM: package rename,
    import migration, CLI migration, documentation links, release notes
    and deprecation policy.
-   Do not break existing consumers silently. If the project is
    pre-release and has no meaningful users, document the decision and
    simplify accordingly.
-   Verify npm package names, GitHub organization/repository
    availability, domains and trademarks before public launch. Do not
    assume availability.

------------------------------------------------------------------------

## 4. Product capabilities and acceptance criteria

### 4.1 Graph Contracts --- foundational capability

**Goal:** Define the expected graph structure and application invariants
in a machine-readable contract.

Required outcomes: - Contract is represented in the canonical IR. -
Contract can be loaded and validated deterministically. - Contract
validation reports actionable paths, expected values and actual
values. - Native Neo4j constraints are mapped accurately; unsupported
rules are identified as application-level checks. - Contract versions
and compatibility changes are explicit. - Generated TypeScript types
agree with the IR. - Contract serialization is stable enough for diffs
and CI.

Acceptance criteria: - A sample project can declare node types,
properties and directed relationships. - Invalid references and
incompatible property definitions fail with clear diagnostics. -
Repeated compilation of the same contract produces deterministic
output. - Tests cover valid, invalid, optional, missing and unsupported
constructs. - Documentation explains exactly which rules are
compile-time, runtime, database-enforced or test-only.

### 4.2 Graph Doctor --- flagship capability

Command concept:

``` bash
npx graph-om doctor
npx graph-om doctor --json
npx graph-om doctor --explain
```

Potential checks, subject to technical feasibility and explicit scope: -
Missing expected constraints and indexes. - Declared-vs-observed label
or relationship-type differences. - Missing required properties. -
Unexpected relationship types. - Duplicate relationships where a
declared invariant prohibits them. - Application-level relationship
invariants. - Disconnected nodes or suspicious graph patterns only when
the contract/user config defines what is suspicious. - High-degree or
potentially expensive traversal patterns. - Schema drift between
declared contract and database metadata.

Acceptance criteria: - Read-only by default. - Every finding has stable
code, severity, summary, evidence, affected object(s), explanation and
remediation proposal. - Findings distinguish metadata checks from data
scans. - Potentially expensive scans require clear scope/limits and
explicit opt-in where appropriate. - No automatic data repair in the
initial version. - Supports human-readable and machine-readable
output. - Exit codes support CI use. - Tests include clean database,
missing constraint, drift, malformed data and inaccessible database
cases. - Avoid false certainty: a check that cannot be completed reports
"unknown/incomplete," not "passed."

Illustrative output (not a claim about current implementation):

``` text
GraphOM Doctor
  ERROR   Missing uniqueness constraint: User.email
  WARNING Schema drift: undeclared relationship type REVIEWED
  WARNING Data invariant: 42 User nodes missing required property email

Suggested next steps:
  graph-om doctor --explain
  graph-om migrate plan
  graph-om validate
```

### 4.3 Safe Graph Migrations --- production adoption capability

Command concepts:

``` bash
graph-om migrate diff
graph-om migrate plan
graph-om migrate apply
graph-om migrate status
```

Required capabilities, staged: - Schema snapshots. - Contract diffs. -
Migration plan generation. - Impact analysis. - Risk classification. -
Data backfill plans. - Pre- and post-migration validation. - Migration
history. - CI integration. - Recovery guidance.

Risk categories: - **Safe:** likely additive and non-destructive, still
subject to database-specific checks. - **Potentially breaking:** may
require coordinated application deployment or data transformation. -
**Destructive:** removes or rewrites existing data/schema and requires
explicit approval.

Migration safety rules: - Separate schema rollback from data rollback. A
schema operation may be reversible while a data transformation is not. -
Prefer expand-and-contract deployments for breaking changes. - Never
promise automatic rollback if transformed/deleted data cannot be
reconstructed. - Preview affected data and expected operation counts
when feasible. - Require explicit confirmation for destructive
operations. - Require environment identification and refuse ambiguous
production targets. - Support dry-run/plan output. - Store migration
checksums and detect edited historical migrations. - Make execution
idempotency and transaction boundaries explicit. - Do not assume all
Neo4j DDL/data operations share identical transactional semantics;
verify against supported Neo4j versions.

Acceptance criteria: - A migration plan is deterministic for the same
contract and snapshot. - The plan identifies unknowns and assumptions. -
A dry run does not mutate the database. - Destructive steps cannot
execute through default non-interactive settings. - Tests cover
interruption, retry, partial completion, drift, failed validation and
recovery documentation. - Migration state can be inspected without
applying changes.

### 4.4 Query Intelligence

Two separate modes must be exposed:

1.  **Static analysis:** inspect GraphOM query AST/generated Cypher and
    known contract metadata without running the query.
2.  **Database-backed inspection:** use Neo4j `EXPLAIN` / `PROFILE` and
    report actual plan/runtime data when available.

Potential checks: - Unbounded traversals. - Excessive relationship
expansion. - Missing pagination or limits. - Potential Cartesian
products. - Filter/index mismatches where reliably detectable. -
Non-deterministic pagination. - Expensive result hydration. - Query
timeout and result-size policy. - Repeated query patterns / N+1 behavior
if telemetry supports detection.

Acceptance criteria: - Static estimates are clearly labeled as
estimates. - `EXPLAIN` is distinguished from `PROFILE`. - `PROFILE` is
opt-in because it executes the query. - Query parameters remain
parameterized; do not interpolate user data into Cypher. - Explain
warnings with source locations when available. - Tests assert generated
Cypher and parameter separation.

### 4.5 Relationship-aware pagination

Provide independent pagination per parent relationship, not a single
global limit across all parents.

Potential API concept (must be reconciled with existing public API
before implementation):

``` ts
const users = await client.findMany("User", {
  include: {
    posts: {
      limit: 10,
      orderBy: { createdAt: "desc" },
      cursor: { after: postCursor }
    }
  }
});
```

Investigate and test: - Correct per-parent pagination semantics. -
Stable cursor ordering and tie-breakers. - Counts where practical. -
Lazy relationship loading. - Explicit maximum traversal depth. -
Result-size limits. - Streaming for large results. - Query plans and
memory use.

Do not ship an API that looks correct but applies one global `LIMIT` to
all parents.

### 4.6 Graph-aware testing

Potential API concepts:

``` ts
import { graphTest } from "@graphom/testing";

await graphTest(client)
  .createNode("User", { id: "u1" })
  .createRelation("FOLLOWS", { from: "u1", to: "u1" })
  .expectInvalid();
```

``` ts
await graphTest(client)
  .assertGraphInvariant({
    node: "Order",
    relationship: "PLACED_BY",
    target: "Customer",
    minimum: 1
  });
```

Potential capabilities: - Temporary fixtures and cleanup. - Test
isolation. - Relationship invariant assertions. - Graph snapshots. -
Contract conformance tests. - Query regression tests. - Migration
tests. - Property-based graph generation.

Acceptance criteria: - Isolation strategy is documented and tested. -
Test helpers do not silently affect shared databases. - Cleanup runs
after failures. - Business invariant tests can run in CI. - Fixtures are
typed against the contract where possible.

### 4.7 Studio and observability --- later

Studio should initially visualize the declared schema and compare it
with database metadata; it should not become a complex graph data editor
before the core is reliable.

Potential later features: - Node/relationship types, direction and
properties. - Constraints, indexes and contract version. -
Declared-vs-actual comparison. - Click-through diagnostics and migration
plans.

Observability should build on OpenTelemetry-compatible traces/metrics
where practical. Avoid a proprietary monitoring system unless user
research justifies it.

------------------------------------------------------------------------

## 5. Agent-native development: a first-class requirement

### 5.1 Product promise

A coding agent should be able to understand the project's graph
contract, propose a change, implement it, run deterministic checks and
present a safe migration plan.

GraphOM is not a replacement for Claude Code, Codex, Cursor, VS Code
agents or Neo4j MCP. It is the graph-specific engineering and
verification layer they can use.

### 5.2 Target workflow

1.  **Understand:** retrieve project context, schema, relationship
    semantics, constraints and conventions.
2.  **Plan:** propose model/query/migration changes and analyze impact.
3.  **Implement:** update TypeScript code, contract and migration.
4.  **Verify:** validate contract, inspect query, run graph tests and
    detect drift.
5.  **Approve:** request human/pipeline approval for risky or
    destructive actions.
6.  **Report:** summarize files changed, checks run, findings, migration
    risks and unresolved questions.

### 5.3 MCP tool design

Candidate read/analysis tools: - `graphom.get_project_context` -
`graphom.get_schema` - `graphom.inspect_database` -
`graphom.validate_contract` - `graphom.analyze_change` -
`graphom.plan_migration` - `graphom.explain_query` -
`graphom.run_graph_tests` - `graphom.check_drift`

Separate read-only analysis from mutation tools. If mutation tools are
added later: - Require explicit environment and operation scope. -
Require a reviewed plan or approval token. - Reject destructive actions
by default. - Emit auditable results. - Never let the model infer
production authorization.

### 5.4 Skills and agent instructions

Ship: - A GraphOM Agent Skill with workflows for modeling, queries,
migrations, diagnostics and testing. - `AGENTS.md` guidance and
examples. - Provider-specific setup documentation only where tested. -
CLI commands with stable machine-readable JSON output and meaningful
exit codes. - MCP resources for contracts, diagnostics and migration
plans.

Do not hard-code one AI vendor. Keep agent instructions portable.

### 5.5 Agent acceptance tests

Build end-to-end scenarios where an agent is asked to: - Add a node type
and relationship. - Rename a property with a staged migration. - Add a
uniqueness constraint after checking existing duplicates. - Implement
per-parent pagination. - Fix a query warning. - Add a graph invariant
test.

For each scenario, assert: - The agent had the necessary project
context. - The generated change compiles. - Contract validation
passes. - Migration plan is correct and non-destructive unless
explicitly approved. - Graph tests pass against a disposable test
database. - The agent reports checks and unresolved risks honestly.

------------------------------------------------------------------------

## 6. CLI and developer experience

Candidate commands (adapt to existing conventions):

``` bash
graph-om init
graph-om introspect
graph-om generate
graph-om validate
graph-om doctor
graph-om migrate diff
graph-om migrate plan
graph-om migrate apply
graph-om migrate status
graph-om inspect
graph-om query explain
graph-om studio
graph-om test
```

Requirements: - `--help` and actionable errors. - Human and JSON
output. - Stable exit codes. - Non-interactive CI mode. - Dry-run
support where relevant. - No secrets in logs or diagnostic output. -
Explicit target environment/database. - Commands must not silently
mutate data. - Avoid implementing every command as a stub in the first
release; ship only commands backed by real behavior.

------------------------------------------------------------------------

## 7. Repository audit: mandatory Phase 0

Before refactoring, agents must inspect the actual repository.

### 7.1 Inspect

-   Git status, branches and recent history.
-   Root README and documentation.
-   `package.json` files, workspace config and lockfile.
-   Existing four packages and their dependency graph.
-   Source tree, public exports and generated files.
-   Schema definition API.
-   Compiler, AST and Cypher generation.
-   Runtime client and Neo4j driver usage.
-   Transaction/session lifecycle and error handling.
-   Type generation and declaration output.
-   Validation integrations (including any existing Zod integration).
-   Existing CLI and scripts.
-   Tests, fixtures, CI and coverage.
-   Build, lint, formatting and release workflows.
-   Existing package names, versioning and published artifacts, if any.
-   Neo4j versions supported and current integration test setup.

### 7.2 Produce audit deliverables before large edits

Create: - `docs/GRAPHOM_REPOSITORY_AUDIT.md` -
`docs/GRAPHOM_CURRENT_ARCHITECTURE.md` -
`docs/GRAPHOM_GAP_ANALYSIS.md` - `docs/GRAPHOM_REFACTOR_DECISIONS.md`

The gap analysis must map each proposed capability to: - Existing
code/module. - Current implementation status: implemented / partial /
absent / unknown. - Reuse/refactor/replace decision. - Dependencies and
risks. - Tests required. - Acceptance criteria. - Estimated effort with
confidence level.

### 7.3 No-go conditions

Do not begin broad refactoring if: - The baseline cannot build or test
and the cause is unknown. - Existing public API behavior has not been
captured. - There is no safe disposable Neo4j test environment for
database mutations. - The proposed IR duplicates an existing schema
representation without a migration plan. - Package renaming would break
a release or consumer without a compatibility decision.

Fix or document the baseline first.

------------------------------------------------------------------------

## 8. Phased implementation plan

These are planning estimates, not commitments. Re-estimate after
repository audit and team-capacity review.

### Phase 0 --- Audit and baseline (approximately weeks 1--2)

-   Inspect repository and actual architecture.
-   Run build, lint, unit and integration tests.
-   Record baseline behavior and known failures.
-   Map current packages and APIs.
-   Identify existing schema model and compiler architecture.
-   Check naming/package availability.
-   Write audit and gap analysis.
-   Agree on compatibility and release strategy.

**Exit gate:** The team can explain what exists, what is missing, what
can be reused and how to test changes safely.

### Phase 1 --- Core correctness and GraphOM identity (approximately weeks 3--7)

-   Fix compiler/AST correctness issues.
-   Verify generated Cypher and parameterization.
-   Verify transaction/session lifecycle and failure handling.
-   Establish or formalize canonical schema IR.
-   Establish type-generation correctness.
-   Add deterministic compiler tests and public API tests.
-   Introduce GraphOM naming in docs/internal metadata with a
    compatibility plan.

**Exit gate:** Reliable core, repeatable builds, meaningful tests,
documented compatibility decision.

### Phase 2 --- Graph Contracts and Doctor (approximately weeks 8--11)

-   Implement contract serialization and validation.
-   Implement metadata introspection.
-   Implement read-only Doctor checks.
-   Add structured diagnostics and JSON output.
-   Add drift comparison and CI exit codes.
-   Add tests for missing constraints and declared-vs-observed
    differences.

**Exit gate:** A developer can inspect a real disposable Neo4j database
and receive accurate, actionable findings without mutation.

### Phase 3 --- Safe migrations (approximately weeks 12--16)

-   Schema snapshots and diffs.
-   Migration plan model.
-   Risk classification and impact report.
-   Dry-run and migration status.
-   Explicit approval for destructive steps.
-   Backfill design and validation.
-   Recovery/partial-failure tests.

**Exit gate:** A reviewed migration can be planned and tested safely on
disposable environments, with limitations clearly reported.

### Phase 4 --- Query intelligence and relationship pagination (approximately weeks 17--20)

-   Static query analysis.
-   `EXPLAIN` integration.
-   Explicit opt-in `PROFILE`.
-   Query safety limits.
-   Correct per-parent pagination.
-   Performance and memory regression tests.

**Exit gate:** The tool distinguishes static findings from actual plan
data and pagination semantics are proven by tests.

### Phase 5 --- Graph testing and agent integration (approximately weeks 21--24)

-   Graph invariant test APIs.
-   Fixture isolation and cleanup.
-   CI integration.
-   MCP read/analysis tools.
-   Agent Skill and `AGENTS.md`.
-   Agent workflow evaluation scenarios.

**Exit gate:** At least the core agent workflows can understand,
implement and verify graph changes in a disposable project.

### Phase 6 --- Studio, observability and ecosystem (approximately weeks 25--36)

-   Schema-focused Studio.
-   Contract/database visualization.
-   OpenTelemetry integration where justified.
-   Improve onboarding and migration from Metal.
-   Evaluate additional database adapters based on demand.
-   Stabilize API and publish release documentation.

**Exit gate:** A production-ready release with supported compatibility,
security, documentation and adoption evidence.

------------------------------------------------------------------------

## 9. Immediate prioritized backlog

### P0 --- Must do first

-   [ ] Repository audit and baseline.
-   [ ] Current architecture and package dependency map.
-   [ ] Public API and behavior inventory.
-   [ ] Compiler and generated Cypher correctness tests.
-   [ ] Transaction/session lifecycle audit.
-   [ ] Disposable Neo4j integration test environment.
-   [ ] Canonical IR decision.
-   [ ] GraphOM naming and compatibility decision.

### P1 --- First differentiated release

-   [ ] Contract model and deterministic validation.
-   [ ] Neo4j metadata introspection.
-   [ ] Graph Doctor read-only checks.
-   [ ] Stable diagnostic codes and JSON output.
-   [ ] Declared-vs-observed drift report.
-   [ ] CLI `validate` and `doctor`.
-   [ ] CI examples and documentation.

### P2 --- Production confidence

-   [ ] Schema snapshots and diff.
-   [ ] Migration plan and risk classification.
-   [ ] Dry-run and explicit approval gates.
-   [ ] Backfill and post-migration validation.
-   [ ] Migration history/status.
-   [ ] Query static analysis and `EXPLAIN`.
-   [ ] Relationship pagination correctness.
-   [ ] Graph invariant testing.

### P3 --- Agent/ecosystem expansion

-   [ ] MCP read/analysis server.
-   [ ] Portable GraphOM Agent Skill.
-   [ ] `AGENTS.md` templates.
-   [ ] Agent end-to-end tests.
-   [ ] Studio.
-   [ ] Observability.
-   [ ] Additional database adapters only after demand validation.

------------------------------------------------------------------------

## 10. Quality, security and operational requirements

### Correctness

-   Deterministic compilation and migration planning.
-   Unit, integration, type-level and end-to-end tests.
-   Test generated Cypher and parameter values separately.
-   Test transaction success, failure, timeout and cleanup.
-   Test Neo4j supported-version matrix.
-   No unverified assumptions about database semantics.

### Security

-   Least-privilege database credentials.
-   Read-only credentials for Doctor where possible.
-   No secrets in logs, JSON diagnostics, telemetry or agent context.
-   Explicit database/environment targeting.
-   Destructive migration approval.
-   Safe defaults for CI and non-interactive operation.
-   Treat database content and tool output as untrusted input.
-   Restrict MCP tool capabilities by default.
-   Do not allow AI agents to bypass authorization or approval controls.

### Reliability

-   Clear timeout and retry policies.
-   Idempotent migration orchestration where feasible.
-   Explicit partial-failure state.
-   Actionable errors with stable codes.
-   No silent swallowing of transaction or driver errors.

### Documentation

-   Getting started.
-   Existing Neo4j database adoption.
-   Contract reference.
-   Doctor checks and limitations.
-   Migration safety model.
-   Query inspection modes.
-   Agent/MCP setup.
-   Security and production deployment.
-   Metal-to-GraphOM upgrade path.

------------------------------------------------------------------------

## 11. Validation and success metrics

Do not treat the strategic ratings in the original proposal as measured
market demand. Validate with actual developers.

Interview: 1. Existing Neo4j/TypeScript developers. 2. Developers using
relational databases and tools such as Prisma/Drizzle who are evaluating
graph databases. 3. AI/knowledge-graph developers maintaining graph data
and agent-generated code.

Prototype experiments: - Graph Doctor discovers a problem developers had
missed. - Migration preview helps a developer understand and reduce
deployment risk. - Query inspector helps fix an expensive query. - Graph
testing reduces manual integration-test effort. - Agent workflow
completes a graph change with fewer errors and less human rework.

Measure: - Time to complete representative tasks. - Issues detected
before deployment. - False-positive and false-negative rates. -
Migration plan accuracy and recovery outcomes. - Agent task completion
rate. - Human interventions required. - Developer trust and willingness
to keep using GraphOM.

A key product test: **Would developers miss GraphOM if they returned to
their previous workflow?**

------------------------------------------------------------------------

## 12. Required documentation to maintain

Create and keep current:

-   `GRAPHOM_PRODUCT_SPEC.md` --- positioning, users, problems, scope
    and non-goals.
-   `GRAPHOM_ARCHITECTURE.md` --- actual architecture and target
    architecture, clearly distinguished.
-   `GRAPHOM_API_SPEC.md` --- public TypeScript APIs and compatibility
    rules.
-   `GRAPHOM_IMPLEMENTATION_PLAN.md` --- phases, backlog, dependencies
    and acceptance criteria.
-   `GRAPHOM_QUALITY_SECURITY.md` --- test strategy, security model and
    release gates.
-   `docs/GRAPHOM_REPOSITORY_AUDIT.md` --- facts discovered in the
    repository.
-   `docs/GRAPHOM_GAP_ANALYSIS.md` --- mapping from target to current
    code.

Do not write fictional "current state" descriptions. Mark unresolved
items as `UNKNOWN` and investigate them.

------------------------------------------------------------------------

## 13. Master prompt for the coding agent

Use this as the initial task for the primary coding agent:

> You are the lead engineer responsible for evolving the existing Metal
> TypeScript/Neo4j project into GraphOM.
>
> Read `GRAPHOM_AGENT_IMPLEMENTATION_PLAN.md` completely before changing
> code.
>
> Your first task is a repository audit, not implementation. Inspect the
> actual source tree, packages, public APIs, compiler, schema model,
> driver integration, transactions, tests, build scripts and CI. Run the
> existing checks and record the baseline.
>
> Create the audit, architecture, gap-analysis and refactor-decision
> documents listed in the plan. Map every target capability to real
> files/modules and classify it as implemented, partial, absent or
> unknown. Cite exact repository paths and symbols. Do not invent
> modules or claim functionality that does not exist.
>
> Propose the smallest safe sequence of changes that preserves working
> behavior. Identify API compatibility risks and package rename
> implications. Do not perform a wholesale rewrite or split packages
> without evidence.
>
> After the audit, implement only the next approved P0/P1 task. Before
> editing, state the objective, files expected to change, risks and
> tests. After editing, run the relevant tests/build/lint/type checks
> and report exact results. If a check cannot run, explain why.
>
> Never run destructive operations against a production or unknown
> database. Use disposable Neo4j test infrastructure. Diagnostics must
> be read-only by default. Migration execution must be
> dry-run/plan-first and require explicit approval for destructive
> operations.
>
> Keep static query analysis separate from actual Neo4j
> `EXPLAIN`/`PROFILE` measurements. Do not overstate estimates. Treat
> MCP/agent output and graph data as untrusted. Do not let an AI agent
> bypass GraphOM's validation or authorization.
>
> Do not attempt all roadmap phases in one task. Work in small vertical
> slices with tests, documentation and reviewable commits. Stop and ask
> for a decision when a product/API/security choice cannot be safely
> inferred.
>
> At the end of each task, report: summary, files changed, behavior/API
> impact, tests and exact outcomes, remaining risks, documentation
> updated, and the next recommended task.

------------------------------------------------------------------------

## 14. Instructions for parallel agents

Parallelize only after the repository audit establishes boundaries.
Suggested roles:

-   **Agent A --- Core/compiler:** schema IR, AST, Cypher generation,
    types and transactions.
-   **Agent B --- Introspection/Doctor:** Neo4j metadata inspection,
    diagnostics and drift checks.
-   **Agent C --- Migration design:** snapshots, diff, plan, risk
    classification and recovery design.
-   **Agent D --- Agent integration:** MCP, Skills, CLI JSON contracts
    and agent evaluation harness.
-   **Agent E --- QA/security:** test matrix, disposable database setup,
    security review and CI.

Coordination rules: - One owner for shared IR and public API
decisions. - Agents must not independently invent competing schema
representations. - Use separate branches/worktrees where supported. -
Agree on interfaces before parallel implementation. - Integrate through
reviewed PRs and run the full suite after merges. - Avoid simultaneous
edits to shared compiler, package manifests or generated files.

------------------------------------------------------------------------

## 15. Definition of GraphOM 1.0

Do not call GraphOM 1.0 ready until:

-   The core TypeScript API and compiler are stable and documented.
-   Neo4j support and supported versions are explicit.
-   The canonical contract and validation behavior are documented.
-   Doctor checks are accurate, explainable and safe.
-   Migration planning and execution have explicit safety controls and
    recovery guidance.
-   Query analysis clearly distinguishes static checks from
    database-backed plans.
-   Graph-aware tests can run safely in CI.
-   Agent/MCP workflows are documented and permission-scoped.
-   Security, compatibility and release procedures are tested.
-   A developer can adopt GraphOM on an existing Neo4j project without
    an unsafe rewrite.

**Final product principle:** GraphOM should make graph applications
easier to understand, safer to change, easier to debug and more
predictable to operate --- for both humans and AI coding agents.
