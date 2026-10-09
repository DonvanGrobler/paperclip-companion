# ADR 0001 — Clean desktop scaffold and reuse boundary

Date: 9 October 2026
Status: Proposed — maintainer licensing review pending
Issue: P0-01 / [#1](https://github.com/DonvanGrobler/paperclip-companion/issues/1)

## Context

The supplied plan recommends Electron, TypeScript and React, while requiring independent artwork, narrow validated IPC, no autonomous actions and no screenshot persistence. The [pinned source review](../research/P0-01-reuse-inventory.md) found useful reference patterns alongside incompatible behavior and distinct code/asset licenses.

## Alternatives considered

1. Fork Felix Rieseberg's Electron application. Closest stack, but requires removing its Microsoft art, local-model/download systems, persistence and broad bridge before establishing our own gates.
2. Port RaymonDev's Python application. Small overlay example, but changes stack and inherits command execution and screenshot-to-disk behavior outside scope.
3. Start from the OpenAI DevKit example. Provides documented provider boundaries, but uses restricted source and a macOS native application, and puts authentication ahead of the mock-first plan.
4. Create a clean Electron scaffold and use upstream projects only as research references.

## Proposed decision

Choose option 4. No upstream source, images, animation data, fonts or dependency lockfiles are adopted. Keep Electron/TypeScript/React/Vite as the plan's provisional baseline. Select the scaffold generator, package manager and supported version pins in P0-02 using current primary documentation. This ADR does not select final art, approve an app-wide license, settle capture technology or authorize a provider integration.

## Consequences and tradeoffs

We must implement and test our own small window lifecycle, animation state machine and IPC boundaries. In return, we can keep the mock-first build independent of model downloads, accounts and inherited storage/actions. Every dependency actually installed will still need a lockfile and license inventory; starting clean does not waive that work.

For P4, prefer independently authored integration against official provider documentation without copying DevKit code. This is a direction for later review, not a final OD-04 decision or a conclusion about service eligibility. If DevKit reuse is later chosen, record the scope, noncommercial restrictions and required notices in a separate provider ADR before copying it.

## Review and reversal

Maintainer review is required by AGENTS.md and development-plan §6.3 for licensing work. No approval is implied by this document's existence. A later proposal may adopt specifically audited code, but must name its exact revision/files, preserve notices, resolve asset provenance and meet the same privacy tests. Keep P0-01 In review and G0 not evaluated until the relevant evidence and review exist.
