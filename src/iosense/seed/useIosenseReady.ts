import { useEffect } from 'react';
import { useIoExecutions } from '../store/executionStore';
import { useIoWorkflows } from '../store/workflowStore';
import { SEED_DIRECTORY, seedExecutions, seedWorkflows } from './seed';

let seeding: Promise<void> | null = null;

/** Seeds the sample workspace once, after the execution history has loaded. */
export function seedIosense(force = false): Promise<void> {
  if (seeding && !force) return seeding;
  seeding = (async () => {
    const now = Date.now();
    const workflows = seedWorkflows(now);
    const executions = await seedExecutions(now, workflows);
    useIoWorkflows.getState().load({ workflows, ...SEED_DIRECTORY });
    useIoExecutions.getState().replaceAll(executions);
  })();
  return seeding;
}

/** True once both stores are loaded and the sample data exists. */
export function useIosenseReady(): boolean {
  const hydrated = useIoExecutions((s) => s.hydrated);
  const seeded = useIoWorkflows((s) => s.seeded);
  useEffect(() => {
    if (hydrated && !seeded) void seedIosense();
  }, [hydrated, seeded]);
  return hydrated && seeded;
}
