// Sends bot and backend-function errors to a private Discord channel (ERROR_WEBHOOK_URL) so bugs in
// rarely used actions get seen without anyone reporting them. Each distinct error posts once, then
// repeats of it are counted and summed into one follow-up per window, so a loop can't flood the channel.
// Without ERROR_WEBHOOK_URL it only logs, exactly as before.

const WINDOW_MS = 60 * 60 * 1000;
const MAX_POSTS_PER_WINDOW = 30;

// The first app frame identifies an error better than the message alone (ids and numbers vary).
function signatureOf(err, context = {}) {
  const message = String(err?.message ?? err ?? 'Unknown error')
    .replace(/\b\d{5,}\b/g, '#')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#')
    .slice(0, 200);
  const frame = String(err?.stack || '').split('\n').slice(1)
    .find((l) => l.includes('/spotbot/') && !l.includes('node_modules')) || '';
  const where = frame.replace(/.*\/spotbot\//, '').replace(/[()]/g, '').trim();
  return `${context.source || 'bot'}|${message}|${where}`;
}

// Interaction context worth knowing when fixing a bug; never message content or user names.
function interactionContext(interaction) {
  if (!interaction) return {};
  const ctx = { source: 'interaction', guild: interaction.guildId || 'DM' };
  if (interaction.commandName) ctx.action = `/${interaction.commandName}${interaction.options?.getSubcommand?.(false) ? ` ${interaction.options.getSubcommand(false)}` : ''}`;
  else if (interaction.customId) ctx.action = String(interaction.customId).split(':')[0];
  if (interaction.__webPanel) ctx.via = 'Control Room';
  return ctx;
}

function formatReport(err, context, count) {
  const name = err?.name && err.name !== 'Error' ? `${err.name}: ` : '';
  const lines = [`**${context.source === 'function' ? 'Function' : 'Bot'} error**${count > 1 ? ` (${count} times in the previous hour)` : ''}`];
  const meta = ['action', 'fn', 'status', 'guild', 'via'].filter((k) => context[k]).map((k) => `${k}: \`${String(context[k]).slice(0, 80)}\``);
  if (meta.length) lines.push(meta.join(' · '));
  lines.push('```' + `${name}${String(err?.message ?? err)}`.slice(0, 400) + '```');
  const stack = String(err?.stack || '').split('\n').slice(1, 6).map((l) => l.trim()).join('\n');
  if (stack) lines.push('```' + stack.slice(0, 900) + '```');
  return lines.join('\n').slice(0, 1900);
}

function createErrorReporter({ webhookUrl = process.env.ERROR_WEBHOOK_URL, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const seen = new Map(); // signature -> { first, count, reported }
  let windowStart = now();
  let posts = 0;

  async function post(content) {
    if (!webhookUrl || !fetchImpl) return false;
    if (now() - windowStart > WINDOW_MS) { windowStart = now(); posts = 0; }
    if (posts >= MAX_POSTS_PER_WINDOW) return false;
    posts++;
    try {
      await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
      return true;
    } catch (e) {
      log.warn?.('[error-reporter] webhook post failed:', e?.message || e);
      return false;
    }
  }

  // Report an error. Returns whether a message was posted (tests use it).
  async function report(err, context = {}) {
    const sig = signatureOf(err, context);
    const t = now();
    const entry = seen.get(sig);
    if (entry && t - entry.first < WINDOW_MS) {
      entry.count++;
      return false;
    }
    // A new window for this error: post it, carrying the repeat count from the last window.
    const repeats = entry ? entry.count : 1;
    seen.set(sig, { first: t, count: 1 });
    if (seen.size > 500) seen.delete(seen.keys().next().value);
    return post(formatReport(err, context, repeats));
  }

  return { report, enabled: !!webhookUrl };
}

const shared = createErrorReporter();

module.exports = {
  createErrorReporter,
  reportError: (err, context) => shared.report(err, context).catch(() => false),
  interactionContext,
  signatureOf,
};
