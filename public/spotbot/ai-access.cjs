// AI Assistant access: /me → AI Assistant gives a player a personal token for the GafferBot MCP server
// (gafferbot.app/mcp), so Claude, ChatGPT and other AI apps can read their clubs, stats, events and team
// sheets as them. The token is shown once, privately; /me → Revoke AI Access turns every token off.

function createAiAccess({ callEdgeFunction, dashboardUrl }) {
  const mcpUrl = `${dashboardUrl.replace(/\/+$/, '')}/mcp`;

  function setupMessage(token) {
    return [
      '🤖 **Your GafferBot AI token** (shown once, keep it private: it can read everything you can see)',
      `\`${token}\``,
      '',
      '**Claude.ai, Claude Desktop or ChatGPT**: add a custom connector with this URL:',
      `\`${mcpUrl}?key=${token}\``,
      '**Claude Code**:',
      `\`claude mcp add --transport http gafferbot ${mcpUrl} --header "Authorization: Bearer ${token}"\``,
      '**Other apps**: MCP server URL ' + `\`${mcpUrl}\`` + ' with header `Authorization: Bearer <token>`.',
      '',
      'Then ask things like "how did we do last night?" or "who is available for Thursday?". Lost it or shared it by mistake? Use **/me → Revoke AI Access**.',
    ].join('\n');
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'aiaccess') return false;
    const action = interaction.options.getString('action') || 'create';
    await interaction.deferReply({ flags: 64 });
    const { data, error } = await callEdgeFunction('mcp-token', {
      action,
      discord_user_id: interaction.user.id,
      label: interaction.guild?.name ? `Created in ${interaction.guild.name}`.slice(0, 60) : 'AI assistant',
    });
    if (error || data?.error) {
      await interaction.editReply({ content: `❌ ${data?.error || 'Could not reach GafferBot. Try again in a minute.'}` });
      return true;
    }
    if (action === 'revoke') {
      await interaction.editReply({ content: data.revoked ? `🔌 Turned off ${data.revoked} AI token${data.revoked === 1 ? '' : 's'}. AI apps using them lose access now.` : 'You have no active AI tokens.' });
    } else {
      await interaction.editReply({ content: setupMessage(data.token) });
    }
    return true;
  }

  return { handleInteraction };
}

const AI_ACCESS_COMMANDS = [
  {
    name: 'aiaccess',
    description: 'Connect an AI assistant (Claude, ChatGPT) to GafferBot with a personal token.',
    options: [{ name: 'action', description: 'Create a token or revoke all of yours.', type: 3, required: false, choices: [{ name: 'Create token', value: 'create' }, { name: 'Revoke all', value: 'revoke' }] }],
  },
];

module.exports = { createAiAccess, AI_ACCESS_COMMANDS };
