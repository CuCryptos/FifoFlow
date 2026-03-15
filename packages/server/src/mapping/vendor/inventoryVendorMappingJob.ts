import type {
  InventoryVendorMappingJobRequest,
  InventoryVendorMappingJobResult,
  InventoryVendorRepository,
} from './types.js';
import { executeInventoryVendorMappingJob } from './inventoryVendorResolver.js';

export async function runInventoryVendorMappingJob(
  request: InventoryVendorMappingJobRequest,
  repository: InventoryVendorRepository,
): Promise<InventoryVendorMappingJobResult> {
  return executeInventoryVendorMappingJob(request, repository);
}
