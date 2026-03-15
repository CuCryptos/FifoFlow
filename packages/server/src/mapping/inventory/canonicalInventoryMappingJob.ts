import type { CanonicalInventoryRepository, CanonicalInventoryMappingJobRequest, CanonicalInventoryMappingJobResult } from './types.js';
import { executeCanonicalInventoryMappingJob } from './canonicalInventoryResolver.js';

export async function runCanonicalInventoryMappingJob(
  request: CanonicalInventoryMappingJobRequest,
  repository: CanonicalInventoryRepository,
): Promise<CanonicalInventoryMappingJobResult> {
  return executeCanonicalInventoryMappingJob(request, repository);
}
