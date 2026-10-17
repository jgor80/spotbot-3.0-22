// Web control room: lets a signed-in gafferbot.app user press the same /manager and /me panel buttons
// from the browser. Nothing is reimplemented: each press becomes an interaction that looks like the
// Discord one (the user's real server member, a real channel, the same options) and goes through
// routeInteraction, so the same handlers, permission checks and stored settings apply.
//
// What the handler would have shown privately in Discord comes back to the web page instead; anything
// it posts publicly is posted in the chosen channel exactly as from Discord. Buttons, menus and forms
// in those replies keep working from the web: a click is sent back as a component interaction with
// the same custom id, and a form (modal) is answered as a modal submit.
//
// The web-panel backend function calls this in-process through globalThis.__gafferbotWebPanels after
// checking the web user's session and server access (requireGuildAccess).

const crypto = require('crypto');
const { Collection, Embed, PermissionsBitField, MessageFlagsBitField, ChannelType } = require('discord.js');
const { ACTIONS, AREAS, PLAYER_ACTIONS, playerHub, optionResolver, actionFields, deniedReason } = require('./panels.cjs');
const { missingChannelPerms, missingPermsMessage } = require('./perm-check.cjs');

const F = PermissionsBitField.Flags;
const EPHEMERAL = 64;
// Answer the web request after this long; the page then polls for the rest (AI graphics take a while)
const RUN_WAIT_MS = 20000;
const POLL_WAIT_MS = 15000;
const CHOICES_WAIT_MS = 4000;
const RECORD_TTL_MS = 30 * 60 * 1000;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

// Web-only entries that open an existing bot panel privately instead of posting it
const EXTRA_ACTIONS = [
  { id: 'wb_graphics', label: 'Graphics Studio', emoji: '🎨', areaKey: 'premium', view: 'graphics', style: 'primary', hint: 'Player cards, match posters, lineups and recruitment art, previewed here.' },
  { id: 'wb_setup', label: 'Setup Wizard', emoji: '🧭', areaKey: 'admin', cmd: 'setup', hint: 'EA club link and kit, team colours and crest, club identity, then the channels GafferBot posts in.' },
];
// Actions that read the presser's live Discord voice channel
const NEEDS_VOICE = new Set(['ln_vcspots', 'ln_posboard', 'dr_start', 'dr_panel']);

class WebError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());
const newId = () => crypto.randomBytes(9).toString('base64url');

function humanize(name) {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isEphemeral(opts) {
  if (!opts || typeof opts !== 'object') return false;
  if (opts.ephemeral === true) return true;
  const f = opts.flags;
  if (typeof f === 'number' || typeof f === 'bigint') return (Number(f) & EPHEMERAL) !== 0;
  if (Array.isArray(f)) return f.some((x) => x === EPHEMERAL || x === 'Ephemeral');
  if (f && typeof f.has === 'function') return f.has(EPHEMERAL);
  return false;
}

// Message options the channel accepts: no response-only fields, no ephemeral flag
function sendable(opts) {
  if (typeof opts === 'string') return { content: opts };
  const { ephemeral, fetchReply, withResponse, message, flags, ...rest } = opts || {};
  if (typeof flags === 'number' && flags & ~EPHEMERAL) rest.flags = flags & ~EPHEMERAL;
  return rest;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

// A reply as plain JSON for the page: embeds and components via toJSON (which also applies /brand), images as data URLs
function serialize(opts, previous = null) {
  if (typeof opts === 'string') opts = { content: opts };
  opts = opts || {};
  const toJ = (x) => (x && typeof x.toJSON === 'function' ? x.toJSON() : x);
  const out = previous ? { ...previous } : { content: null, embeds: [], components: [], files: [] };
  if ('content' in opts) out.content = opts.content ?? null;
  if ('embeds' in opts) out.embeds = (opts.embeds || []).map(toJ);
  if ('components' in opts) out.components = (opts.components || []).map(toJ);
  if ('files' in opts) {
    out.files = [];
    for (const f of opts.files || []) {
      const raw = f?.attachment ?? f;
      const name = f?.name || 'file';
      const ext = String(name).split('.').pop().toLowerCase();
      if (Buffer.isBuffer(raw)) {
        if (raw.length <= MAX_FILE_BYTES) out.files.push({ name, url: `data:${MIME[ext] || 'application/octet-stream'};base64,${raw.toString('base64')}` });
        else out.files.push({ name, url: null, tooLarge: true });
      } else if (typeof raw === 'string' && /^https?:\/\//.test(raw)) out.files.push({ name, url: raw });
    }
  } else if (Array.isArray(opts.attachments) && !opts.attachments.length) out.files = [];
  return out;
}

// A file picked on the page, as the attachment a modal upload would carry (its url is a data URL)
function webFile(f) {
  const m = String(f?.data || '').match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new WebError(400, 'That file could not be read. Try another one.');
  const size = Math.floor((m[2].length * 3) / 4);
  if (size > MAX_FILE_BYTES) throw new WebError(400, 'That file is too large (6 MB at most).');
  const name = String(f.name || 'upload').replace(/[^\w.-]/g, '_').slice(0, 100);
  return { id: newId(), name, contentType: m[1], size, url: f.data, proxyURL: f.data };
}

// Every interactive component in a reply, including ones nested in containers and sections
function walkComponents(list, fn) {
  for (const c of list || []) {
    if (!c) continue;
    fn(c);
    if (c.components) walkComponents(c.components, fn);
    if (c.component) walkComponents([c.component], fn);
    if (c.accessory) walkComponents([c.accessory], fn);
  }
}

function createWebPanels(deps) {
  const { getClient, schemas, isManager, dispatch, timezoneFor, graphicsPanel } = deps;
  const schemaByName = new Map(schemas.map((c) => [c.name, c]));
  const runs = new Map();
  const records = new Map();

  const areaByKey = new Map(AREAS.map((a) => [a.key, a]));
  const webActions = new Map(ACTIONS);
  for (const x of EXTRA_ACTIONS) webActions.set(x.id, { ...x, area: areaByKey.get(x.areaKey) || null });

  // Old runs and replies expire so memory stays flat
  setInterval(() => {
    const cutoff = Date.now() - RECORD_TTL_MS;
    for (const [id, r] of runs) if (r.touched < cutoff) runs.delete(id);
    for (const [id, m] of records) if (m.touched < cutoff) records.delete(id);
  }, 5 * 60 * 1000).unref?.();

  // ---------- Who is pressing, where ----------

  async function contextFor(guildId, userId, channelId) {
    const client = getClient();
    const guild = client?.guilds?.cache.get(guildId);
    if (!guild) throw new WebError(404, 'GafferBot is not in that server (or is still starting up).');
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new WebError(403, "Your Discord account isn't a member of that server.");
    let channel = null;
    if (channelId) {
      channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
      if (!channel || !channel.isTextBased?.()) throw new WebError(400, 'Pick a text channel in this server.');
      const perms = channel.permissionsFor(member);
      if (!perms?.has([F.ViewChannel, F.SendMessages])) throw new WebError(403, `You can't post in #${channel.name}, so GafferBot won't post there for you.`);
    }
    return { client, guild, member, channel };
  }

  function channelList(guild, member) {
    const me = guild.members.me;
    const out = [];
    for (const c of guild.channels.cache.values()) {
      if (![...TEXT_TYPES, ...VOICE_TYPES].includes(c.type)) continue;
      const mine = c.permissionsFor(member);
      if (!mine?.has(F.ViewChannel)) continue;
      const text = TEXT_TYPES.includes(c.type);
      out.push({
        id: c.id,
        name: c.name,
        type: c.type,
        parent: c.parent?.name || null,
        position: (c.parent?.rawPosition ?? -1) * 1000 + (c.rawPosition ?? 0),
        canSend: text && !!mine.has(F.SendMessages) && !missingChannelPerms(c, me).length,
      });
    }
    return out.sort((a, b) => a.position - b.position).map(({ position, ...c }) => c);
  }

  // Display names for the mentions in a set of replies, so the page can show @Name and #channel
  function namesFor(guild, payloads) {
    const names = { users: {}, channels: {}, roles: {} };
    if (!guild) return names;
    const text = JSON.stringify(payloads);
    for (const [, kind, id] of text.matchAll(/<(@!?|#|@&)(\d{17,20})>/g)) {
      if (kind === '#') names.channels[id] = guild.channels.cache.get(id)?.name || 'unknown-channel';
      else if (kind === '@&') {
        const role = guild.roles.cache.get(id);
        names.roles[id] = { name: role?.name || 'unknown-role', color: role?.hexColor && role.color ? role.hexColor : null };
      } else {
        const m = guild.members.cache.get(id);
        names.users[id] = m?.displayName || guild.client.users.cache.get(id)?.username || 'unknown-user';
      }
    }
    return names;
  }

  // ---------- Catalogue ----------

  function fieldInfo(action, o) {
    const f = {
      name: o.name,
      label: humanize(o.name),
      description: o.description || null,
      type: o.type,
      required: !!o.required,
      choices: o.choices ? o.choices.map((c) => ({ name: String(c.name), value: String(c.value) })) : null,
      autocomplete: !!o.autocomplete,
    };
    if (o.name === 'when') f.kind = 'when';
    if (o.type === 7) f.channelTypes = action.channels?.[o.name] || o.channel_types || TEXT_TYPES;
    if (o.min_value !== undefined) f.min = o.min_value;
    if (o.max_value !== undefined) f.max = o.max_value;
    if (o.max_length !== undefined) f.maxLength = o.max_length;
    return f;
  }

  function actionInfo(action, member) {
    const fields = action.cmd ? actionFields(schemaByName, action) : [];
    const needsFile = fields.some((o) => o.type === 11 && o.required);
    return {
      id: action.id,
      label: action.label,
      emoji: action.emoji,
      style: action.style || 'secondary',
      fields: fields.filter((o) => o.type !== 11).map((o) => fieldInfo(action, o)),
      ask: !!action.ask,
      denied: deniedReason(member, action, isManager),
      discordOnly: needsFile ? 'Needs a file upload: use this one in Discord.' : null,
      hint: action.hint || (NEEDS_VOICE.has(action.id) ? 'Uses the voice channel you are in on Discord right now.' : null),
    };
  }

  async function context({ guildId, userId }) {
    const { guild, member } = await contextFor(guildId, userId);
    const leader = isManager(member);
    const areas = AREAS.map((area) => ({
      key: area.key,
      label: area.label,
      emoji: area.emoji,
      blurb: area.blurb,
      actions: [...area.actions, ...EXTRA_ACTIONS.filter((x) => x.areaKey === area.key)].map((a) => actionInfo(webActions.get(a.id), member)),
    }));
    const channels = channelList(guild, member);
    const sendable = channels.filter((c) => c.canSend);
    const preferred = [guild.systemChannelId, guild.publicUpdatesChannelId].find((id) => sendable.some((c) => c.id === id));
    return {
      guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 64 }) },
      user: { id: member.id, name: member.displayName },
      leader,
      timezone: (await timezoneFor(guildId).catch(() => null)) || 'UTC',
      voiceChannelId: member.voice?.channelId || null,
      defaultChannelId: preferred || sendable[0]?.id || null,
      channels,
      roles: guild.roles.cache
        .filter((r) => r.id !== guild.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color ? r.hexColor : null })),
      player: { key: 'me', label: 'Player Hub', emoji: '🙋', blurb: 'Your stats, events and settings.', actions: PLAYER_ACTIONS.map((a) => actionInfo(webActions.get(a.id), member)) },
      areas,
    };
  }

  async function members({ guildId, userId, query }) {
    const { guild } = await contextFor(guildId, userId);
    const q = String(query || '').trim().slice(0, 32);
    const list = q ? await guild.members.search({ query: q, limit: 25 }).catch(() => new Collection()) : guild.members.cache;
    return {
      members: [...list.values()]
        .filter((m) => !m.user.bot)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, 25)
        .map((m) => ({ id: m.id, name: m.displayName, username: m.user.username, avatar: m.displayAvatarURL({ size: 32 }) })),
    };
  }

  // ---------- Replies the handler sends ----------

  function newRecord(run, ctx, { ephemeral, payload, discordId = null, thinking = false }) {
    const rec = {
      id: newId(),
      userId: run.userId,
      guildId: ctx.guild.id,
      channelId: ctx.channel?.id || null,
      ephemeral,
      discordId,
      payload,
      thinking,
      deleted: false,
      touched: Date.now(),
    };
    records.set(rec.id, rec);
    touch(run, rec);
    return rec;
  }

  function touch(run, rec) {
    rec.touched = Date.now();
    if (!run.messageIds.includes(rec.id)) run.messageIds.push(rec.id);
    run.touched = Date.now();
  }

  async function channelOf(ctx, rec) {
    if (rec.channelId === ctx.channel?.id) return ctx.channel;
    return ctx.guild.channels.cache.get(rec.channelId) || ctx.guild.channels.fetch(rec.channelId).catch(() => null);
  }

  async function postPublic(ctx, opts) {
    if (!ctx.channel) throw new Error('No channel picked');
    const missing = missingChannelPerms(ctx.channel, ctx.guild.members.me);
    if (missing.length) throw new Error(missingPermsMessage(ctx.channel, missing).replace(/^❌\s*/, ''));
    return ctx.channel.send(sendable(opts));
  }

  // Apply an edit to a reply: the real message when it was posted publicly, else the private copy
  async function editRecord(run, ctx, rec, opts) {
    if (!rec.ephemeral) {
      const channel = await channelOf(ctx, rec);
      if (rec.discordId) {
        const msg = await channel?.messages.fetch(rec.discordId).catch(() => null);
        if (msg) await msg.edit(sendable(opts));
      } else {
        const msg = await postPublic(ctx, opts);
        rec.discordId = msg.id;
      }
    }
    rec.payload = serialize(opts, rec.thinking ? null : rec.payload);
    rec.thinking = false;
    touch(run, rec);
    return rec;
  }

  const noopCollector = () => ({ on() { return this; }, once() { return this; }, stop() {}, removeAllListeners() { return this; } });

  // What message.something looks like to a handler for a private reply
  function fakeMessage(run, ctx, rec) {
    const p = rec.payload || {};
    return {
      id: rec.id,
      channelId: rec.channelId,
      guildId: rec.guildId,
      channel: ctx.channel,
      guild: ctx.guild,
      author: ctx.client.user,
      content: p.content || '',
      embeds: (p.embeds || []).map((e) => new Embed(e)),
      components: p.components || [],
      attachments: new Collection(),
      flags: new MessageFlagsBitField(rec.ephemeral ? EPHEMERAL : 0),
      interaction: null,
      createdTimestamp: rec.touched,
      edit: (opts) => editRecord(run, ctx, rec, opts).then(() => fakeMessage(run, ctx, rec)),
      delete: async () => {
        rec.deleted = true;
        touch(run, rec);
      },
      fetch: async () => fakeMessage(run, ctx, rec),
      createMessageComponentCollector: noopCollector,
      awaitMessageComponent: () => Promise.reject(new Error('Not available from the web app')),
    };
  }

  async function messageFor(run, ctx, rec) {
    if (!rec.ephemeral && rec.discordId) {
      const channel = await channelOf(ctx, rec);
      const msg = await channel?.messages.fetch(rec.discordId).catch(() => null);
      if (msg) return msg;
    }
    return fakeMessage(run, ctx, rec);
  }

  // ---------- The interaction itself ----------

  function makeInteraction(run, ctx, spec) {
    const { client, guild, member, channel } = ctx;
    const kind = spec.kind;
    const compType = spec.componentType || 0;
    let ack = null; // 'reply' | 'update' | 'modal'
    let replyRec = null;
    const already = () => {
      const err = new Error('The reply to this interaction has already been sent or deferred.');
      err.code = 'InteractionAlreadyReplied';
      return err;
    };
    const notYet = () => {
      const err = new Error('The reply to this interaction has not been sent or deferred.');
      err.code = 'InteractionNotReplied';
      return err;
    };
    const response = async (rec, opts) => {
      const message = await messageFor(run, ctx, rec);
      if (opts && typeof opts === 'object' && opts.fetchReply) return message;
      return Object.assign(Object.create(message), { resource: { message }, interaction: ix });
    };
    const findRecord = (ref) => {
      if (!ref || ref === '@original') return replyRec;
      const id = typeof ref === 'string' ? ref : ref.id;
      return records.get(id) || [...records.values()].find((r) => r.discordId === id) || null;
    };

    const ix = {
      __webPanel: true,
      __gpProxy: true,
      id: String(BigInt(Date.now() - 1420070400000) << 22n),
      applicationId: client.application?.id || client.user?.id,
      type: { command: 2, autocomplete: 4, modal: 5 }[kind] || 3,
      client,
      guild,
      guildId: guild.id,
      member,
      user: member.user,
      channel,
      channelId: channel?.id || null,
      locale: 'en-US',
      guildLocale: guild.preferredLocale,
      createdTimestamp: Date.now(),
      createdAt: new Date(),
      memberPermissions: channel ? channel.permissionsFor(member) : member.permissions,
      appPermissions: channel ? channel.permissionsFor(guild.members.me) : guild.members.me?.permissions,
      commandName: spec.commandName,
      commandType: kind === 'command' || kind === 'autocomplete' ? 1 : undefined,
      options: spec.options,
      customId: spec.customId,
      componentType: compType || undefined,
      values: spec.values,
      users: spec.users,
      members: spec.members,
      roles: spec.roles,
      channels: spec.channels,
      fields: spec.fields,
      components: spec.modalComponents,
      message: spec.message,
      replied: false,
      deferred: false,
      ephemeral: null,
      webhook: { send: (opts) => ix.followUp(opts) },
      inGuild: () => true,
      inCachedGuild: () => true,
      inRawGuild: () => false,
      isRepliable: () => kind !== 'autocomplete',
      isCommand: () => kind === 'command' || kind === 'autocomplete',
      isChatInputCommand: () => kind === 'command',
      isContextMenuCommand: () => false,
      isUserContextMenuCommand: () => false,
      isMessageContextMenuCommand: () => false,
      isAutocomplete: () => kind === 'autocomplete',
      isButton: () => kind === 'component' && compType === 2,
      isAnySelectMenu: () => kind === 'component' && compType !== 2,
      isSelectMenu: () => kind === 'component' && compType !== 2,
      isStringSelectMenu: () => kind === 'component' && compType === 3,
      isUserSelectMenu: () => kind === 'component' && compType === 5,
      isRoleSelectMenu: () => kind === 'component' && compType === 6,
      isMentionableSelectMenu: () => kind === 'component' && compType === 7,
      isChannelSelectMenu: () => kind === 'component' && compType === 8,
      isMessageComponent: () => kind === 'component',
      isModalSubmit: () => kind === 'modal',
      isFromMessage: () => !!spec.sourceRecord,

      async reply(opts) {
        if (ack) throw already();
        ack = 'reply';
        ix.replied = true;
        const eph = isEphemeral(opts);
        ix.ephemeral = eph;
        const discordId = eph ? null : (await postPublic(ctx, opts)).id;
        replyRec = newRecord(run, ctx, { ephemeral: eph, payload: serialize(opts), discordId });
        return response(replyRec, opts);
      },
      async deferReply(opts) {
        if (ack) throw already();
        ack = 'reply';
        ix.deferred = true;
        ix.ephemeral = isEphemeral(opts);
        replyRec = newRecord(run, ctx, { ephemeral: ix.ephemeral, payload: serialize({}), thinking: true });
        return response(replyRec, opts);
      },
      async editReply(opts) {
        if (!ack) throw notYet();
        const target = (opts && typeof opts === 'object' && opts.message && opts.message !== '@original') ? findRecord(opts.message) : ack === 'update' ? spec.sourceRecord : replyRec;
        if (!target) throw notYet();
        await editRecord(run, ctx, target, opts);
        return messageFor(run, ctx, target);
      },
      async followUp(opts) {
        if (!ack) throw notYet();
        const eph = isEphemeral(opts);
        const discordId = eph ? null : (await postPublic(ctx, opts)).id;
        const rec = newRecord(run, ctx, { ephemeral: eph, payload: serialize(opts), discordId });
        return messageFor(run, ctx, rec);
      },
      async update(opts) {
        if (ack) throw already();
        if (!spec.sourceRecord) throw new Error('Nothing to update');
        ack = 'update';
        ix.replied = true;
        await editRecord(run, ctx, spec.sourceRecord, opts);
        return response(spec.sourceRecord, opts);
      },
      async deferUpdate() {
        if (ack) throw already();
        if (!spec.sourceRecord) throw new Error('Nothing to update');
        ack = 'update';
        ix.deferred = true;
        touch(run, spec.sourceRecord);
      },
      async showModal(modal) {
        if (ack) throw already();
        if (kind === 'modal') throw new Error('A form cannot open another form');
        ack = 'modal';
        ix.replied = true;
        run.modal = { json: typeof modal?.toJSON === 'function' ? modal.toJSON() : modal, sourceId: spec.sourceRecord?.id || null, channelId: channel?.id || null };
      },
      async fetchReply(ref) {
        const rec = findRecord(ref);
        if (!rec) throw notYet();
        return messageFor(run, ctx, rec);
      },
      async deleteReply(ref) {
        const rec = findRecord(ref);
        if (!rec) throw notYet();
        if (!rec.ephemeral && rec.discordId) {
          const msg = await (await channelOf(ctx, rec))?.messages.fetch(rec.discordId).catch(() => null);
          await msg?.delete().catch(() => {});
        }
        rec.deleted = true;
        touch(run, rec);
      },
      async respond(choices) {
        spec.onChoices?.(choices || []);
      },
      awaitModalSubmit: () => Promise.reject(new Error('Not available from the web app')),
    };
    return ix;
  }

  // ---------- Runs ----------

  function newRun(userId, guildId) {
    const run = { id: newId(), userId, guildId, messageIds: [], modal: null, done: false, error: null, promise: null, touched: Date.now() };
    runs.set(run.id, run);
    return run;
  }

  function snapshot(run, guild) {
    const messages = run.messageIds
      .map((id) => records.get(id))
      .filter(Boolean)
      .map((r) => ({ id: r.id, ephemeral: r.ephemeral, channelId: r.channelId, discordMessageId: r.discordId, thinking: r.thinking, deleted: r.deleted, payload: r.payload }));
    return {
      runId: run.id,
      done: run.done,
      error: run.error,
      modal: run.modal ? { json: run.modal.json } : null,
      messages,
      names: namesFor(guild, messages.map((m) => m.payload)),
    };
  }

  async function start(run, ctx, ix, wait = RUN_WAIT_MS) {
    run.promise = Promise.resolve()
      .then(() => dispatch(ix))
      .catch((err) => {
        console.warn(`[web-panels] ${ix.commandName || ix.customId} failed: ${err.message}`);
        run.error = 'GafferBot could not finish that. Please try again.';
      })
      .finally(() => {
        run.done = true;
        run.touched = Date.now();
      });
    await Promise.race([run.promise, sleep(wait)]);
    return snapshot(run, ctx.guild);
  }

  // Turn the page's values into what the old handler reads, checked like Discord's own form would
  async function readValues(ctx, action, values) {
    const out = {};
    const memberMap = {};
    for (const o of actionFields(schemaByName, action)) {
      const raw = values?.[o.name];
      const empty = raw === undefined || raw === null || raw === '';
      if (empty) {
        if (o.required) throw new WebError(400, `Fill in **${humanize(o.name).toLowerCase()}**.`);
        continue;
      }
      const label = humanize(o.name);
      if (o.type === 6 || o.type === 9) {
        const id = String(raw);
        const member = await ctx.guild.members.fetch(id).catch(() => null);
        if (member) {
          out[o.name] = member.user;
          memberMap[o.name] = member;
        } else if (o.type === 9 && ctx.guild.roles.cache.get(id)) out[o.name] = ctx.guild.roles.cache.get(id);
        else throw new WebError(400, `${label}: that player isn't in this server.`);
      } else if (o.type === 7) {
        const ch = ctx.guild.channels.cache.get(String(raw));
        if (!ch || !ch.permissionsFor(ctx.member)?.has(F.ViewChannel)) throw new WebError(400, `${label}: pick a channel you can see.`);
        const types = action.channels?.[o.name] || o.channel_types;
        if (types && !types.includes(ch.type)) throw new WebError(400, `${label}: that kind of channel doesn't fit here.`);
        out[o.name] = ch;
      } else if (o.type === 8) {
        const role = ctx.guild.roles.cache.get(String(raw));
        if (!role) throw new WebError(400, `${label}: pick a role from this server.`);
        out[o.name] = role;
      } else if (o.type === 5) {
        out[o.name] = raw === true || raw === 'true';
      } else if (o.type === 4 || o.type === 10) {
        const n = Number(raw);
        if (!Number.isFinite(n) || (o.type === 4 && !Number.isInteger(n))) throw new WebError(400, `${label} needs to be a ${o.type === 4 ? 'whole ' : ''}number.`);
        if (o.min_value !== undefined && n < o.min_value) throw new WebError(400, `${label} must be at least ${o.min_value}.`);
        if (o.max_value !== undefined && n > o.max_value) throw new WebError(400, `${label} must be at most ${o.max_value}.`);
        out[o.name] = n;
      } else if (o.type === 3) {
        const s = String(raw).trim().slice(0, o.max_length || 4000);
        if (o.choices && !o.choices.some((c) => String(c.value) === s)) throw new WebError(400, `${label}: pick one of the listed options.`);
        if (s) out[o.name] = s;
      }
    }
    return { values: out, members: memberMap };
  }

  function actionFor(actionId, member) {
    const action = webActions.get(actionId);
    if (!action) throw new WebError(404, 'That action no longer exists. Reload the page.');
    const why = deniedReason(member, action, isManager);
    if (why) throw new WebError(403, why.replace(/\*\*/g, ''));
    if (actionFields(schemaByName, action).some((o) => o.type === 11 && o.required)) throw new WebError(400, 'This one needs a file upload, so use it in Discord.');
    return action;
  }

  async function run({ guildId, userId, actionId, values, channelId }) {
    const ctx = await contextFor(guildId, userId, channelId);
    if (!ctx.channel) throw new WebError(400, 'Pick a channel for anything GafferBot posts.');
    const action = actionFor(actionId, ctx.member);
    const r = newRun(userId, guildId);

    if (action.builtin === 'playerhub') {
      await postPublic(ctx, playerHub({ persistent: true }));
      newRecord(r, ctx, { ephemeral: true, payload: serialize(`✅ Player Hub posted in <#${ctx.channel.id}>. Pin it so players can find it.`) });
      r.done = true;
      return snapshot(r, ctx.guild);
    }
    if (action.view === 'graphics') {
      const panel = await graphicsPanel(guildId).catch(() => null);
      newRecord(r, ctx, { ephemeral: true, payload: serialize(panel || 'No club is set up yet. Run the Setup Wizard first.') });
      r.done = true;
      return snapshot(r, ctx.guild);
    }

    const { values: resolved, members: memberMap } = await readValues(ctx, action, values);
    const options = optionResolver(action, { ...resolved, ...(action.fixed || {}) }, memberMap);
    const ix = makeInteraction(r, ctx, { kind: 'command', commandName: action.cmd, options });
    return start(r, ctx, ix);
  }

  // Suggestions for an autocomplete input, from the same autocomplete handler Discord uses
  async function choices({ guildId, userId, actionId, field, focused, channelId }) {
    const ctx = await contextFor(guildId, userId, channelId);
    const action = actionFor(actionId, ctx.member);
    const o = actionFields(schemaByName, action).find((f) => f.name === field);
    if (!o?.autocomplete) return { choices: [] };
    const options = optionResolver(action, {});
    const typed = String(focused || '').slice(0, 100);
    options.getFocused = (full) => (full ? { name: field, value: typed, focused: true, type: o.type } : typed);
    let list = null;
    const r = newRun(userId, guildId);
    const ix = makeInteraction(r, ctx, { kind: 'autocomplete', commandName: action.cmd, options, onChoices: (c) => (list = c) });
    await Promise.race([Promise.resolve().then(() => dispatch(ix)).catch(() => {}), sleep(CHOICES_WAIT_MS)]);
    runs.delete(r.id);
    return { choices: (list || []).slice(0, 25).map((c) => ({ name: String(c.name), value: String(c.value) })) };
  }

  function ownRecord(messageId, guildId, userId) {
    const rec = records.get(messageId);
    if (!rec || rec.guildId !== guildId || rec.userId !== userId || rec.deleted) throw new WebError(404, 'That panel has expired. Open it again.');
    return rec;
  }

  // A button press or menu pick on a reply shown in the web app
  async function click({ guildId, userId, messageId, customId, values }) {
    const rec = ownRecord(messageId, guildId, userId);
    let comp = null;
    walkComponents(rec.payload?.components, (c) => {
      if (c.custom_id === customId) comp = c;
    });
    if (!comp || comp.disabled) throw new WebError(400, 'That button is no longer on the panel.');
    const ctx = await contextFor(guildId, userId, rec.channelId);
    const r = newRun(userId, guildId);
    const spec = { kind: 'component', componentType: comp.type, customId, sourceRecord: rec };
    if (comp.type !== 2) {
      const picked = (Array.isArray(values) ? values : []).map(String).slice(0, comp.max_values ?? 1);
      if (picked.length < (comp.min_values ?? 1)) throw new WebError(400, 'Pick an option first.');
      if (comp.type === 3) {
        const allowed = new Set((comp.options || []).map((x) => x.value));
        if (picked.some((v) => !allowed.has(v))) throw new WebError(400, 'Pick one of the listed options.');
      }
      spec.values = picked;
      if (comp.type === 5 || comp.type === 7) {
        spec.users = new Collection();
        spec.members = new Collection();
        for (const id of picked) {
          const m = await ctx.guild.members.fetch(id).catch(() => null);
          if (m) {
            spec.users.set(id, m.user);
            spec.members.set(id, m);
          }
        }
      }
      if (comp.type === 6 || comp.type === 7) spec.roles = new Collection(picked.map((id) => ctx.guild.roles.cache.get(id)).filter(Boolean).map((role) => [role.id, role]));
      if (comp.type === 8) {
        spec.channels = new Collection();
        for (const id of picked) {
          const ch = ctx.guild.channels.cache.get(id);
          if (!ch || !ch.permissionsFor(ctx.member)?.has(F.ViewChannel)) throw new WebError(400, 'Pick a channel you can see.');
          spec.channels.set(id, ch);
        }
      }
    }
    spec.message = await messageFor(r, ctx, rec);
    const ix = makeInteraction(r, ctx, spec);
    return start(r, ctx, ix);
  }

  // The answers to a form (modal) a handler opened
  async function submit({ guildId, userId, runId, values }) {
    const opened = runs.get(runId);
    if (!opened || opened.userId !== userId || opened.guildId !== guildId || !opened.modal) throw new WebError(404, 'That form has expired. Open it again.');
    const { json, sourceId, channelId } = opened.modal;
    const ctx = await contextFor(guildId, userId, channelId);
    const inputs = [];
    walkComponents(json.components, (c) => {
      if (c.custom_id && [3, 4, 5, 6, 7, 8, 19].includes(c.type)) inputs.push(c);
    });
    const fieldMap = new Collection();
    const resolved = {};
    for (const c of inputs) {
      const raw = values?.[c.custom_id];
      if (c.type === 4) {
        const v = String(raw ?? '').slice(0, c.max_length || 4000);
        if (c.required !== false && !v.trim()) throw new WebError(400, `Fill in ${c.label || 'every required box'}.`);
        if (v && c.min_length && v.length < c.min_length) throw new WebError(400, `${c.label || 'A box'} needs at least ${c.min_length} characters.`);
        fieldMap.set(c.custom_id, { customId: c.custom_id, type: 4, value: v });
      } else if (c.type === 19) {
        // Required uploads (pro photos) must come from Discord; optional ones (a crest) can come from the page
        if (c.required !== false && (c.min_values ?? 1) > 0) throw new WebError(400, 'This form needs a file upload, so finish it in Discord.');
        const files = (Array.isArray(raw) ? raw : []).slice(0, c.max_values ?? 1).map(webFile);
        fieldMap.set(c.custom_id, { customId: c.custom_id, type: 19, values: files.map((f) => f.id), attachments: new Collection(files.map((f) => [f.id, f])) });
      } else {
        const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).slice(0, c.max_values ?? 1);
        if (picked.length < (c.min_values ?? (c.required === false ? 0 : 1))) throw new WebError(400, 'Pick an option in every required menu.');
        if (c.type === 3) {
          const allowed = new Set((c.options || []).map((x) => x.value));
          if (picked.some((v) => !allowed.has(v))) throw new WebError(400, 'Pick one of the listed options.');
        }
        const entry = { customId: c.custom_id, type: c.type, values: picked };
        if (c.type === 5 || c.type === 7) {
          entry.users = new Collection();
          entry.members = new Collection();
          for (const id of picked) {
            const m = await ctx.guild.members.fetch(id).catch(() => null);
            if (m) {
              entry.users.set(id, m.user);
              entry.members.set(id, m);
            }
          }
        }
        if (c.type === 6 || c.type === 7) entry.roles = new Collection(picked.map((id) => ctx.guild.roles.cache.get(id)).filter(Boolean).map((r) => [r.id, r]));
        if (c.type === 8) {
          entry.channels = new Collection();
          for (const id of picked) {
            const ch = ctx.guild.channels.cache.get(id);
            if (!ch || !ch.permissionsFor(ctx.member)?.has(F.ViewChannel)) throw new WebError(400, 'Pick a channel you can see.');
            entry.channels.set(id, ch);
          }
        }
        fieldMap.set(c.custom_id, entry);
      }
      resolved[c.custom_id] = fieldMap.get(c.custom_id);
    }
    const get = (id) => {
      const f = fieldMap.get(id);
      if (!f) {
        const err = new TypeError(`Bad field "${id}"`);
        err.code = 'ModalSubmitInteractionFieldNotFound';
        throw err;
      }
      return f;
    };
    const fields = {
      fields: fieldMap,
      components: json.components,
      getField: (id) => get(id),
      getTextInputValue: (id) => get(id).value ?? '',
      getStringSelectValues: (id) => get(id).values || [],
      getSelectedUsers: (id) => get(id).users || null,
      getSelectedMembers: (id) => get(id).members || null,
      getSelectedRoles: (id) => get(id).roles || null,
      getSelectedChannels: (id) => get(id).channels || null,
      getSelectedMentionables: (id) => ({ users: get(id).users || new Collection(), members: get(id).members || new Collection(), roles: get(id).roles || new Collection() }),
      getUploadedFiles: (id) => get(id).attachments || null,
    };
    opened.modal = null;
    const r = newRun(userId, guildId);
    const source = sourceId ? records.get(sourceId) : null;
    const spec = { kind: 'modal', customId: json.custom_id, fields, modalComponents: json.components, sourceRecord: source || null };
    if (source) spec.message = await messageFor(r, ctx, source);
    const ix = makeInteraction(r, ctx, spec);
    return start(r, ctx, ix);
  }

  // What a button, menu or form is, without pressing it (the AI assistant shows this before it acts)
  async function describe({ guildId, userId, messageId, customId, runId }) {
    if (runId) {
      const opened = runs.get(runId);
      if (!opened || opened.userId !== userId || opened.guildId !== guildId || !opened.modal) throw new WebError(404, 'That form has expired. Open it again.');
      return { kind: 'form', form: opened.modal.json };
    }
    const rec = ownRecord(messageId, guildId, userId);
    let comp = null;
    walkComponents(rec.payload?.components, (c) => {
      if (c.custom_id === customId) comp = c;
    });
    if (!comp || comp.disabled) throw new WebError(400, 'That button is no longer on the panel.');
    return { kind: comp.type === 2 ? 'button' : 'menu', component: comp, message: rec.payload };
  }

  async function poll({ guildId, userId, runId }) {
    const r = runs.get(runId);
    if (!r || r.userId !== userId || r.guildId !== guildId) throw new WebError(404, 'That result has expired.');
    if (!r.done) await Promise.race([r.promise, sleep(POLL_WAIT_MS)]);
    const guild = getClient()?.guilds?.cache.get(guildId);
    return snapshot(r, guild);
  }

  // One entry point for the backend function: { op, guildId, userId, ... }
  async function handle(op, args) {
    const fn = { context, members, run, choices, click, submit, poll, describe }[op];
    if (!fn) throw new WebError(400, 'Unknown request');
    if (!/^\d{17,20}$/.test(String(args?.guildId || '')) || !/^\d{17,20}$/.test(String(args?.userId || ''))) throw new WebError(400, 'Pick a server');
    return fn(args);
  }

  return { handle, WebError };
}

module.exports = { createWebPanels, serialize, isEphemeral, sendable, walkComponents, WebError };
