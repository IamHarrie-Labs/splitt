import { hashJson } from '@splitt/core';
import type { LiveRepository, LiveState } from './repository.js';
export function workspaceExport(scope: string, state: LiveState) {
  if (state.jobs.some((j) => !['confirmed', 'failed', 'expired'].includes(j.state)))
    throw new Error('Resolve all unfinished payment jobs before migration.');
  return {
    version: 1 as const,
    scope,
    exportedAt: new Date().toISOString(),
    state,
    stateHash: hashJson(state),
  };
}
export async function importWorkspace(
  repo: LiveRepository,
  input: ReturnType<typeof workspaceExport>,
  scope: string,
) {
  if (input.version !== 1 || input.scope !== scope || input.stateHash !== hashJson(input.state))
    throw new Error('Workspace identity or integrity check failed.');
  workspaceExport(scope, input.state);
  return repo.transaction((current) => {
    if (
      current.projects.length ||
      current.events.length ||
      current.jobs.length ||
      current.plans.length
    )
      throw new Error('Destination workspace is not empty. Import refused.');
    Object.assign(current, input.state);
    return {
      projects: current.projects.length,
      jobs: current.jobs.length,
      events: current.events.length,
      nextBlock: current.nextBlock,
      stateHash: input.stateHash,
    };
  });
}
