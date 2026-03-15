import type { IntelligenceJobContext, IntelligenceJobDefinition } from '../types.js';
import { executeWeeklyOperatingMemo, type WeeklyOperatingMemoDependencies } from './weeklyOperatingMemoEngine.js';
import type { WeeklyOperatingMemoExecutionResult, WeeklyOperatingMemoRunSummary } from './types.js';

export const weeklyOperatingMemoJobDefinition: IntelligenceJobDefinition = {
  jobName: 'weekly-operating-memo-job',
  purpose: 'Aggregate persisted live intelligence signals into a ranked weekly operating brief with provisional routing.',
  expectedInputs: [
    'persisted live intelligence signals',
    'memo window',
    'ranking and routing rules',
  ],
  expectedOutputs: [
    'structured weekly operating memo payload',
    'memo run records',
  ],
  todos: [
    'Layer persisted recommendations into memo sections once recommendation synthesis is mature.',
    'Add benchmark-aware memo views once peer-group benchmarking is live.',
    'Support standards review summaries as durable memo-ready objects rather than placeholders.',
  ],
};

export async function runWeeklyOperatingMemoJob(
  context: IntelligenceJobContext,
  dependencies?: WeeklyOperatingMemoDependencies,
): Promise<{
  run?: WeeklyOperatingMemoExecutionResult['run'];
  run_summary?: WeeklyOperatingMemoExecutionResult['run_summary'];
  weekly_operating_memo?: WeeklyOperatingMemoExecutionResult['weekly_operating_memo'];
  weekly_operating_memo_summary?: WeeklyOperatingMemoRunSummary;
  notes: string[];
}> {
  if (!dependencies) {
    return {
      notes: ['Weekly operating memo generation requires persisted-signal read and run-persistence dependencies.'],
      run: undefined,
      run_summary: undefined,
      weekly_operating_memo: undefined,
      weekly_operating_memo_summary: undefined,
    };
  }

  const result = await executeWeeklyOperatingMemo(context, dependencies);
  return {
    run: result.run,
    run_summary: result.run_summary,
    weekly_operating_memo: result.weekly_operating_memo,
    weekly_operating_memo_summary: result.weekly_operating_memo_summary,
    notes: result.notes,
  };
}

export type { WeeklyOperatingMemoDependencies } from './weeklyOperatingMemoEngine.js';
