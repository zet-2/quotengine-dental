import { createWorkerApp } from './createApp.js';
import { getRuntimeConfig } from './config.js';
import {
  purgeExpiredAuditEvents,
  purgeExpiredLeadBatch,
  reconcileStaleReceived,
} from './storage.js';

const app = createWorkerApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env) {
    const config = getRuntimeConfig(env);
    const now = new Date(controller.scheduledTime);
    const staleBefore = new Date(now.getTime() - 10 * 60 * 1_000);
    const reconciled = await reconcileStaleReceived(env, staleBefore, now);
    let deleted = 0;
    let hasMore = true;
    for (let batch = 0; batch < 20 && hasMore; batch += 1) {
      const result = await purgeExpiredLeadBatch(env, now);
      deleted += result.deleted;
      hasMore = result.hasMore;
    }
    const auditDeleted = await purgeExpiredAuditEvents(
      env,
      now,
      config.AUDIT_RETENTION_DAYS,
    );
    console.log(JSON.stringify({
      event: 'retention_maintenance_completed',
      reconciled,
      deleted,
      hasMore,
      auditDeleted,
    }));
  },
} satisfies ExportedHandler<Env>;
