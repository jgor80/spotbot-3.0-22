// Discord fails any interaction not acknowledged within 3 seconds ("GafferBot didn't respond in time").
// When a handler is still busy (slow database, busy server) this defers on its behalf just before the
// deadline, then quietly translates the handler's later reply/update calls onto the deferred response,
// so no handler has to change. Panel proxies (Object.create(interaction)) inherit the wrapped methods.
const EPHEMERAL = 64;
const DEFAULT_DELAY_MS = 2000;

function isEphemeral(opts) {
  if (!opts || typeof opts !== 'object') return false;
  if (opts.ephemeral === true) return true;
  const f = opts.flags;
  if (typeof f === 'number' || typeof f === 'bigint') return (Number(f) & EPHEMERAL) !== 0;
  if (Array.isArray(f)) return f.some((x) => x === EPHEMERAL || x === 'Ephemeral');
  if (f && typeof f.has === 'function') return f.has(EPHEMERAL);
  return false;
}

// Options safe to pass to editReply: drop response-only fields Discord rejects on an edit.
function editable(opts) {
  if (typeof opts === 'string') return { content: opts };
  const { ephemeral, flags, fetchReply, withResponse, ...rest } = opts || {};
  return rest;
}

function delayMs() {
  const v = Number(process.env.INTERACTION_AUTO_DEFER_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DELAY_MS;
}

function guard(interaction, { delay = delayMs(), log = console } = {}) {
  if (!interaction || interaction.isAutocomplete?.() || !interaction.isRepliable?.()) return () => {};

  const base = interaction;
  const orig = {};
  for (const m of ['reply', 'deferReply', 'deferUpdate', 'update', 'showModal', 'editReply', 'followUp', 'deleteReply']) {
    if (typeof base[m] === 'function') orig[m] = base[m].bind(base);
  }
  let acked = false;
  let auto = null; // 'reply' (deferReply) or 'update' (deferUpdate) once the guard stepped in
  let deferring = null; // the guard's own defer, awaited before translating a handler call
  let redirect = null; // { ephemeral, id } when the handler deferred a fresh reply after an auto deferUpdate
  let originalGone = false;

  const mark = (self, field) => {
    if (self && self !== base) self[field] = true;
  };
  const dropOriginal = async () => {
    if (auto === 'reply' && !originalGone) {
      originalGone = true;
      await orig.deleteReply().catch(() => {});
    }
  };
  const sendRedirected = async (opts) => {
    if (redirect.id) return orig.editReply({ ...editable(opts), message: redirect.id });
    const msg = await orig.followUp({ ...editable(opts), ...(redirect.ephemeral ? { flags: EPHEMERAL } : {}) });
    redirect.id = msg?.id;
    await dropOriginal();
    return msg;
  };

  const wrap = (name, fn) => {
    base[name] = async function (...args) {
      if (deferring) await deferring;
      if (!auto) {
        acked = acked || ['reply', 'deferReply', 'deferUpdate', 'update', 'showModal'].includes(name);
        return orig[name](...args);
      }
      return fn.call(this, ...args);
    };
  };

  wrap('reply', async function (opts) {
    mark(this, 'replied');
    if (auto === 'update' || isEphemeral(opts)) {
      const msg = await orig.followUp(opts);
      await dropOriginal();
      return msg;
    }
    return orig.editReply(editable(opts));
  });
  wrap('deferReply', async function (opts) {
    mark(this, 'deferred');
    if (auto === 'update' || isEphemeral(opts)) redirect = { ephemeral: isEphemeral(opts), id: null };
  });
  wrap('deferUpdate', async function () {
    mark(this, 'deferred');
  });
  wrap('update', async function (opts) {
    mark(this, 'replied');
    return orig.editReply(editable(opts));
  });
  wrap('showModal', async function () {
    mark(this, 'replied');
    return orig.followUp({ content: '⏳ That took a moment too long to open. Press it again.', flags: EPHEMERAL });
  });
  wrap('editReply', async function (opts) {
    if (redirect) return sendRedirected(opts);
    return orig.editReply(opts);
  });
  wrap('deleteReply', async function (...args) {
    if (redirect?.id) return orig.deleteReply(redirect.id);
    return orig.deleteReply(...args);
  });

  const timer = setTimeout(() => {
    if (acked || base.deferred || base.replied) return;
    acked = true;
    // Components keep their message (deferUpdate); commands and forms get a "thinking" reply
    const mode = base.isMessageComponent?.() ? 'update' : 'reply';
    const label = base.commandName ? `/${base.commandName}` : base.customId || 'interaction';
    deferring = (mode === 'update' ? orig.deferUpdate() : orig.deferReply())
      .then(() => {
        auto = mode;
        log.warn?.(`[ack-guard] auto-deferred slow ${label} after ${delay}ms`);
      })
      .catch((err) => log.warn?.(`[ack-guard] auto-defer of ${label} failed: ${err.message}`))
      .finally(() => {
        deferring = null;
      });
  }, delay);
  timer.unref?.();
  return () => clearTimeout(timer);
}

module.exports = { guard, isEphemeral, editable };
