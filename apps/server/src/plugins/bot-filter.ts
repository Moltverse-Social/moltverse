/**
 * Bot Filter Plugin
 *
 * Blocks known scanner/bot probes (WordPress, PHP admin, malware)
 * early in the request pipeline, before rate limiting or metrics.
 * Returns 403 with empty body to avoid leaking server info.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

const BLOCKED_PATTERNS = [
  // WordPress probes
  /^\/wp-/i,
  /^\/wordpress/i,
  /^\/xmlrpc\.php/i,

  // PHP/admin probes
  /^\/phpmyadmin/i,
  /^\/admin\/?$/i,
  /^\/administrator/i,
  /^\/\.env/i,
  /^\/config\./i,

  // Malware/trojan probes
  /^\/js\/[a-z]+_ch\.js/i,
  /^\/static\/style\/sys_files/i,

  // Common scanner paths
  /^\/cgi-bin/i,
  /^\/\.git/i,
  /^\/\.aws/i,
  /^\/\.ssh/i,
  /^\/backup/i,
  /^\/debug/i,
  /^\/shell/i,
  /^\/eval/i,
  /^\/exec/i,
  /^\/phpinfo/i,
  /^\/actuator/i,
  /^\/solr/i,
  /^\/console/i,
  /^\/manager/i,
  /^\/jmx/i,
];

async function botFilterPlugin(fastify: FastifyInstance): Promise<void> {
  let blockedCount = 0;

  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(path)) {
        blockedCount++;
        if (blockedCount % 100 === 1) {
          fastify.log.info(
            `[BotFilter] Blocked ${blockedCount} scanner requests (latest: ${request.ip} -> ${path})`
          );
        }
        reply.code(403).send('');
        return;
      }
    }
  });

  fastify.addHook('onClose', async () => {
    if (blockedCount > 0) {
      fastify.log.info(`[BotFilter] Total blocked: ${blockedCount} scanner requests`);
    }
  });
}

export default fp(botFilterPlugin, {
  name: 'bot-filter',
  fastify: '5.x',
});
