import { createHash } from 'node:crypto';
import {
  COMMERCIAL_CATALOG_APPROVAL_ID,
  commercialCatalogApprovalPayload,
} from '../src/dental/commercialCatalog.js';

const computedApprovalId = `sha256:${createHash('sha256')
  .update(commercialCatalogApprovalPayload())
  .digest('hex')}`;

if (computedApprovalId !== COMMERCIAL_CATALOG_APPROVAL_ID) {
  throw new Error(
    `Commercial catalog approval ID is stale: expected ${computedApprovalId}, `
      + `found ${COMMERCIAL_CATALOG_APPROVAL_ID}`,
  );
}

console.log(`Commercial catalog content matches ${COMMERCIAL_CATALOG_APPROVAL_ID}`);
