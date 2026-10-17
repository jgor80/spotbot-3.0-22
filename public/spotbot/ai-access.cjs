// AI Assistant access: connects Claude, ChatGPT and other AI apps to the GafferBot MCP server
// (gafferbot.app/mcp). The easy way is the app's own "sign in" (OAuth with Discord, handled by the
// website), which can also let the AI run the player's club actions after they say yes. A personal
// token (shown once, privately) is the fallback for apps without sign-in, and can only read.
// /me → AI Assistant shows how to connect, the connected apps and the latest changes AI apps made;
// /me → Revoke AI Access turns every token and connected app off.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TOKEN_BUTTON = 'aiaccess:token';

function ago(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.floor(Date.parse(iso) / 1000));
  return `<t:${s}:R>`;
}

function createAiAccess({ callEdgeFunction, dashboardUrl }) {
  const mcpUrl = `${dashboardUrl.replace(/\/+$/, '')}/mcp`;

  function tokenMessage(token) {
    return [
      '🔑 **Your view-only GafferBot AI token** (shown once, keep it private: it can read everything you can see)',
      `\`${token}\``,
      '',
      '**Apps that take only a URL**: add a custom connector with',
      `\`${mcpUrl}?key=${token}\``,
      '**Claude Code**:',
      `\`claude mcp add --transport http gafferbot ${mcpUrl} --header "Authorization: Bearer ${token}"\``,
      '**Other apps**: header `Authorization: Bearer <token>`.',
      '',
      'Tokens can only read. To let an AI run club actions, connect with Discord sign-in instead. Lost it? Use **/me → Revoke AI Access**.',
    ].join('\n');
  }

  function statusMessage(tokens, actions) {
    const apps = tokens.filter((t) => t.oauth_client_id);
    const personal = tokens.filter((t) => !t.oauth_client_id);
    const lines = [
      '🤖 **Connect an AI assistant to GafferBot**',
      `In Claude, ChatGPT or another AI app, add a custom connector with this URL and sign in with Discord when it asks:`,
      `\`${mcpUrl}\``,
      'You pick **View only** or **View and manage**. With manage, the AI can run the same club actions you can in Discord, and it shows you each change and waits for your yes first.',
      '',
      '**Connected apps**',
      apps.length
        ? apps.map((t) => `• ${t.label}: ${(t.scopes || []).includes('clubs:manage') ? 'view and manage' : 'view only'}, last used ${ago(t.last_used_at)}`).join('\n')
        : '• None yet.',
    ];
    if (personal.length) lines.push(`• ${personal.length} view-only token${personal.length === 1 ? '' : 's'} (ending ${personal.map((t) => t.token_hint).join(', ')})`);
    lines.push('', '**Latest changes by AI apps**');
    lines.push(
      actions.length
        ? actions.slice(0, 5).map((a) => `• ${ago(a.created_at)} ${a.ok ? '✅' : '❌'} ${String(a.target || a.tool).slice(0, 60)}`).join('\n')
        : '• None.',
    );
    lines.push('', 'Something look wrong? **/me → Revoke AI Access** turns everything off at once.');
    return lines.join('\n');
  }

  async function edge(action, interaction) {
    return callEdgeFunction('mcp-token', {
      action,
      discord_user_id: interaction.user.id,
      label: interaction.guild?.name ? `Created in ${interaction.guild.name}`.slice(0, 60) : 'AI assistant',
    });
  }

  async function handleInteraction(interaction) {
    const button = interaction.isButton?.() && interaction.customId === TOKEN_BUTTON;
    if (!button && (!interaction.isChatInputCommand?.() || interaction.commandName !== 'aiaccess')) return false;
    const action = button ? 'create' : interaction.options.getString('action') || 'status';
    await interaction.deferReply({ flags: 64 });

    if (action === 'status') {
      const [list, activity] = await Promise.all([edge('list', interaction), edge('activity', interaction)]);
      if (list.error || list.data?.error) {
        await interaction.editReply({ content: `❌ ${list.data?.error || 'Could not reach GafferBot. Try again in a minute.'}` });
        return true;
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(TOKEN_BUTTON).setLabel('Create a view-only token').setEmoji('🔑').setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({ content: statusMessage(list.data?.tokens || [], activity.data?.actions || []), components: [row] });
      return true;
    }

    const { data, error } = await edge(action, interaction);
    if (error || data?.error) {
      await interaction.editReply({ content: `❌ ${data?.error || 'Could not reach GafferBot. Try again in a minute.'}` });
      return true;
    }
    if (action === 'revoke') {
      await interaction.editReply({ content: data.revoked ? `🔌 Turned off ${data.revoked} AI connection${data.revoked === 1 ? '' : 's'} (tokens and connected apps). They lose access now.` : 'You have no active AI tokens or connected apps.' });
    } else {
      await interaction.editReply({ content: tokenMessage(data.token) });
    }
    return true;
  }

  return { handleInteraction };
}

const AI_ACCESS_COMMANDS = [
  {
    name: 'aiaccess',
    description: 'Connect an AI assistant (Claude, ChatGPT) to GafferBot.',
    options: [{
      name: 'action',
      description: 'See how to connect and what AI apps did, create a view-only token, or revoke everything.',
      type: 3,
      required: false,
      choices: [{ name: 'How to connect', value: 'status' }, { name: 'Create view-only token', value: 'create' }, { name: 'Revoke all', value: 'revoke' }],
    }],
  },
];

module.exports = { createAiAccess, AI_ACCESS_COMMANDS, TOKEN_BUTTON };
