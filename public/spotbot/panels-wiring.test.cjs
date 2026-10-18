// Presses every /manager and /me panel button against the real action schemas, the way Discord and the
// web Control Room do, and fails on anything that would break for a player: a button whose command or
// subcommand no longer exists, a form field that silently disappeared, a form Discord would reject, a
// crash while opening or submitting it, or a command nothing handles.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { Collection, PermissionsBitField, ChannelType } = require('discord.js');
const { createPanels, ACTIONS, AREAS, areaMenu, playerHub, actionFields, optionResolver } = require('./panels.cjs');
const { ACTION_SCHEMAS } = require('./action-schemas.cjs');

const GUILD = '111111111111111111';
const USER = '222222222222222222';
const ALL = new PermissionsBitField(PermissionsBitField.All);
const schemaByName = new Map(ACTION_SCHEMAS.map((c) => [c.name, c]));
const actions = [...ACTIONS.values()];
// How a handler reads each input type
const GETTER = { 3: 'getString', 4: 'getInteger', 5: 'getBoolean', 6: 'getUser', 7: 'getChannel', 8: 'getRole', 9: 'getMentionable', 10: 'getNumber', 11: 'getAttachment' };
const sources = () => fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.cjs') && !f.endsWith('.test.cjs') && f !== 'action-schemas.cjs' && f !== 'panels.cjs')
  .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'))
  .join('\n');

function inputsOf(action) {
  const cmd = schemaByName.get(action.cmd);
  const parent = action.group ? (cmd?.options || []).find((o) => o.type === 2 && o.name === action.group) : cmd;
  if (action.sub) {
    const sub = (parent?.options || []).find((o) => o.type === 1 && o.name === action.sub);
    return sub ? sub.options || [] : null;
  }
  return (cmd?.options || []).filter((o) => o.type > 2);
}

// A server where the presser is an admin and the bot can post anywhere
function fakePress(action, { submit = false } = {}) {
  const calls = { replies: [], modals: [], dispatched: [], posted: [] };
  const member = { id: USER, user: { id: USER, username: 'gaffer' }, displayName: 'Gaffer', permissions: ALL, roles: { cache: new Collection() }, voice: {} };
  const channel = { id: '333333333333333333', name: 'general', type: ChannelType.GuildText, permissionsFor: () => ALL, isTextBased: () => true, send: async (o) => calls.posted.push(o) };
  const guild = { id: GUILD, members: { me: { id: '999999999999999999', permissions: ALL }, cache: new Collection([[USER, member]]), fetch: async () => member }, channels: { cache: new Collection() }, roles: { cache: new Collection() } };
  const none = () => { throw new Error('not in form'); };
  const interaction = {
    guildId: GUILD,
    guild,
    channel,
    member,
    user: member.user,
    customId: submit ? `gp:m:${action.id}` : `gp:a:${action.id}`,
    isChatInputCommand: () => false,
    isStringSelectMenu: () => false,
    isButton: () => !submit,
    isModalSubmit: () => submit,
    // An empty form: every field left blank
    fields: { getField: none, getTextInputValue: none, getStringSelectValues: none },
    reply: async (o) => calls.replies.push(o),
    showModal: async (m) => calls.modals.push(m),
  };
  return { interaction, calls };
}

// Stands in for routeInteraction: answers autocomplete probes with one choice and records commands
function panelsFor(calls) {
  return createPanels({
    schemas: ACTION_SCHEMAS,
    isManager: () => true,
    timezoneFor: async () => 'Europe/London',
    dispatch: async (ix) => {
      if (ix.isAutocomplete()) return ix.respond([{ name: 'Palermo', value: 'main' }]);
      calls.dispatched.push(ix);
    },
  });
}

test('every panel action points at a command, subcommand and inputs that exist', () => {
  const problems = [];
  for (const a of actions) {
    if (a.builtin) continue;
    if (!schemaByName.has(a.cmd)) { problems.push(`${a.id}: no command "${a.cmd}"`); continue; }
    const inputs = inputsOf(a);
    if (!inputs) { problems.push(`${a.id}: "${a.cmd}" has no subcommand "${[a.group, a.sub].filter(Boolean).join(' ')}"`); continue; }
    const names = new Set(inputs.map((o) => o.name));
    for (const n of [...(a.fields || []), ...(a.required || []), ...Object.keys(a.fixed || {})]) {
      if (!names.has(n)) problems.push(`${a.id}: "${n}" isn't an input of ${a.cmd}${a.sub ? ` ${a.sub}` : ''}`);
    }
    // Discord forms hold 5 inputs; web-only actions use the Control Room's own form
    if (!a.web && actionFields(schemaByName, a).length > 5) problems.push(`${a.id}: more than 5 form fields`);
  }
  assert.deepEqual(problems, []);
});

test('every command a panel button runs has a handler', () => {
  const src = sources();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const handled = (cmd) => new RegExp(`(commandName\\s*===\\s*|case\\s*|cmd === |name === |\\[)'${esc(cmd)}'`).test(src) || new RegExp(`name:\\s*'${esc(cmd)}'`).test(src);
  const missing = [...new Set(actions.filter((a) => a.cmd).map((a) => a.cmd))].filter((c) => !handled(c));
  assert.deepEqual(missing, []);
});

test('panel menus and the player hub are valid Discord messages', () => {
  const check = (name, msg) => {
    const rows = (msg.components || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
    assert.ok(rows.length <= 5, `${name}: more than 5 rows`);
    for (const row of rows) {
      assert.ok(row.components.length <= 5 || row.components[0].type !== 2, `${name}: more than 5 buttons in a row`);
      for (const c of row.components) {
        if (c.custom_id) assert.ok(c.custom_id.length <= 100, `${name}: custom id too long`);
        if (c.label) assert.ok(c.label.length <= 80, `${name}: label too long`);
      }
    }
  };
  for (const area of AREAS) check(area.key, areaMenu(area.key));
  check('player hub', playerHub());
  check('player hub (posted)', playerHub({ persistent: true }));
  assert.equal(new Set(actions.map((a) => a.id)).size, actions.length, 'duplicate action ids');
});

test('pressing every button opens a valid form or runs its command, without crashing', async () => {
  const problems = [];
  for (const a of actions) {
    const { interaction, calls } = fakePress(a);
    try {
      await panelsFor(calls).handleInteraction(interaction);
    } catch (err) {
      problems.push(`${a.id}: crashed on press: ${err.message}`);
      continue;
    }
    if (calls.modals.length) {
      try {
        calls.modals[0].toJSON();
      } catch (err) {
        problems.push(`${a.id}: Discord would reject its form: ${err.message}`);
      }
    } else if (calls.dispatched.length) {
      const ix = calls.dispatched[0];
      if (ix.commandName !== a.cmd) problems.push(`${a.id}: ran "${ix.commandName}" instead of "${a.cmd}"`);
      if (a.sub && ix.options.getSubcommand(false) !== a.sub) problems.push(`${a.id}: ran subcommand "${ix.options.getSubcommand(false)}" instead of "${a.sub}"`);
    } else if (!calls.replies.length && !calls.posted.length) {
      problems.push(`${a.id}: pressing it did nothing`);
    }
  }
  assert.deepEqual(problems, []);
});

test('submitting every form empty either asks for what is missing or runs the command', async () => {
  const problems = [];
  for (const a of actions.filter((x) => !x.builtin)) {
    const { interaction, calls } = fakePress(a, { submit: true });
    try {
      await panelsFor(calls).handleInteraction(interaction);
    } catch (err) {
      problems.push(`${a.id}: crashed on submit: ${err.message}`);
      continue;
    }
    if (!calls.dispatched.length && !calls.replies.length) problems.push(`${a.id}: submitting did nothing`);
    for (const ix of calls.dispatched) {
      // The handler reads its inputs; none of these lookups may throw for an optional input
      for (const o of (inputsOf(a) || []).filter((x) => !x.required && !(a.required || []).includes(x.name))) {
        try {
          ix.options[GETTER[o.type]](o.name);
        } catch (err) {
          problems.push(`${a.id}: reading optional "${o.name}" threw: ${err.message}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('handlers only read options a button press can answer', () => {
  // A panel press reaches handlers as a stand-in for the old slash command; a method it lacks crashes them
  const resolver = optionResolver({ cmd: 'x' }, {});
  const used = [...new Set([...sources().matchAll(/\boptions\??\.(get[A-Za-z]+)\(/g)].map((m) => m[1]))];
  assert.deepEqual(used.filter((m) => typeof resolver[m] !== 'function'), []);
});
