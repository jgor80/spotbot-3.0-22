// Keeps the bot process alive through stray errors and guards slash-command registration.
const { reportError } = require('./error-reporter.cjs');

// Discord allows 100 global (top-level) commands per application; subcommands don't count.
const DISCORD_COMMAND_LIMIT = 100;
const COMMAND_WARN_AT = 90;

// Discord error codes that just mean "this interaction is gone": expired token or already answered.
const IGNORABLE_DISCORD_CODES = new Set([10062, 40060]);

function isIgnorableDiscordError(err) {
  return !!err && IGNORABLE_DISCORD_CODES.has(err.code);
}

// Log unhandled rejections and exceptions instead of letting Node exit. A burst of exceptions
// still exits so the host restarts a process that is genuinely wedged.
function installProcessGuards({ maxExceptionsPerMinute = 20 } = {}) {
  let recent = [];

  process.on('unhandledRejection', (reason) => {
    if (isIgnorableDiscordError(reason)) return;
    console.error('❌ Unhandled promise rejection:', reason);
    reportError(reason, { source: 'unhandled rejection' });
  });

  process.on('uncaughtException', (err) => {
    if (isIgnorableDiscordError(err)) return;
    console.error('❌ Uncaught exception:', err);
    reportError(err, { source: 'uncaught exception' });
    const now = Date.now();
    recent = recent.filter((t) => now - t < 60_000);
    recent.push(now);
    if (recent.length >= maxExceptionsPerMinute) {
      console.error(`❌ ${recent.length} uncaught exceptions in the last minute; exiting so the host restarts the bot.`);
      process.exit(1);
    }
  });
}

// Without an 'error' listener, discord.js re-throws client errors and the process dies.
function installClientGuards(client) {
  client.on('error', (err) => { console.error('❌ Discord client error:', err); reportError(err, { source: 'discord client' }); });
  client.on('shardError', (err, shardId) => console.error(`❌ Discord shard ${shardId} error:`, err));
  client.on('warn', (msg) => console.warn('⚠️ Discord warning:', msg));
}

// Discord rejects the whole set if any rule is broken, so check before registering:
// duplicate names are dropped, and anything past the limit is left off (and logged) so the rest still register.
function prepareCommandsForRegistration(commands, log = console) {
  const seen = new Set();
  const unique = [];
  for (const cmd of commands) {
    if (seen.has(cmd.name)) {
      log.error(`❌ Duplicate slash command "/${cmd.name}" skipped. Make it a subcommand or rename it.`);
      continue;
    }
    seen.add(cmd.name);
    unique.push(cmd);
  }

  const count = unique.length;
  if (count > DISCORD_COMMAND_LIMIT) {
    const dropped = unique.slice(DISCORD_COMMAND_LIMIT).map((c) => `/${c.name}`);
    log.error(`❌ ${count} top-level slash commands; Discord allows ${DISCORD_COMMAND_LIMIT}. Not registering: ${dropped.join(', ')}. Fold commands into subcommands.`);
    return unique.slice(0, DISCORD_COMMAND_LIMIT);
  }
  if (count >= COMMAND_WARN_AT) {
    log.warn(`⚠️ ${count} of ${DISCORD_COMMAND_LIMIT} top-level slash commands used. Add new features as subcommands.`);
  } else {
    log.log(`ℹ️ ${count} of ${DISCORD_COMMAND_LIMIT} top-level slash commands used.`);
  }
  return unique;
}

// Tell the user something went wrong, whatever state the interaction is in.
async function replyWithError(interaction, content = 'Something went wrong. Please try again.') {
  if (!interaction?.isRepliable?.()) return;
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else if (interaction.replied) {
      await interaction.followUp({ content, flags: 64 });
    } else {
      await interaction.reply({ content, flags: 64 });
    }
  } catch (err) {
    if (!isIgnorableDiscordError(err)) console.error('❌ Could not send error reply:', err.message || err);
  }
}

module.exports = {
  DISCORD_COMMAND_LIMIT,
  COMMAND_WARN_AT,
  isIgnorableDiscordError,
  installProcessGuards,
  installClientGuards,
  prepareCommandsForRegistration,
  replyWithError
};
