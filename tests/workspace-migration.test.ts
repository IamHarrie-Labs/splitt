import { describe, it, expect } from 'vitest';
import { workspaceExport, importWorkspace } from '../server/src/live/migration';
import { fixtureProjects } from '../server/src/fixtures';
import type { LiveState, LiveRepository } from '../server/src/live/repository';
describe('workspace migration', () => {
  const empty = (): LiveState => ({
    nextBlock: '1',
    events: [],
    projects: [],
    jobs: [],
    plans: [],
  });
  const scope = '5042002:0xvault';
  it('copies financial history and cursors only into an empty matching workspace', async () => {
    const source = { ...empty(), projects: fixtureProjects(), nextBlock: '123' };
    const exported = workspaceExport(scope, source);
    let target = empty();
    const repo: LiveRepository = {
      snapshot: async () => structuredClone(target),
      transaction: async (fn) => fn(target),
    };
    await importWorkspace(repo, exported, scope);
    expect(target).toEqual(source);
    await expect(importWorkspace(repo, exported, scope)).rejects.toThrow('not empty');
  });
  it('rejects tampered snapshots and a different vault scope', async () => {
    const exported = workspaceExport(scope, empty());
    const repo: LiveRepository = {
      snapshot: async () => empty(),
      transaction: async (fn) => fn(empty()),
    };
    await expect(importWorkspace(repo, exported, 'another-vault')).rejects.toThrow('identity');
    exported.state.nextBlock = '999';
    await expect(importWorkspace(repo, exported, scope)).rejects.toThrow('integrity');
  });
  it.each(['queued', 'submitting', 'pending', 'invariant_violation'])(
    'blocks migration with %s payment work',
    (state) => {
      const source = empty();
      source.jobs.push({ state } as LiveState['jobs'][number]);
      expect(() => workspaceExport(scope, source)).toThrow('unfinished');
    },
  );
});
