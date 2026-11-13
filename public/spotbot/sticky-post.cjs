// Panels that "always stay at the bottom" of a channel (Manager desk, stats panel, Graphics Studio).
// They used to be deleted and posted again on every bot restart, which pinged anyone who gets
// notified for new messages in that channel, and auto-deploy restarts the bot on every merge.
//
// placeSticky keeps that quiet:
//   - after a restart (no known message id) a panel that is still the newest message is edited in
//     place: no new message, no unread badge, no notification;
//   - any panel that does have to be posted again goes out with Discord's "silent message" flag and
//     with every mention turned off.

const SUPPRESS_NOTIFICATIONS = 1 << 12; // MessageFlags.SuppressNotifications

// channel: a text channel; payload: { embeds, components, content? }
// knownId: the panel id this process already posted (null right after a restart)
// isOurs(message): true for an earlier copy of this panel
// Returns the panel message (or null when sending failed).
async function placeSticky(channel, payload, { knownId = null, isOurs }) {
  const botId = channel.client?.user?.id;
  const mine = (m) => m && m.author?.id === botId && isOurs(m);
  if (knownId) {
    await channel.messages.delete(knownId).catch(() => {});
  } else {
    // After a restart: reuse the panel if nothing has been posted under it, clear older copies.
    const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    const list = [...(recent?.values() || [])].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const newest = list[0];
    let kept = null;
    if (mine(newest)) {
      kept = await newest.edit({
        content: payload.content || null,
        embeds: payload.embeds || [],
        components: payload.components || [],
        allowedMentions: { parse: [] },
      }).catch(() => null);
    }
    for (const m of list) {
      if (m !== newest || !kept) {
        if (mine(m)) await m.delete().catch(() => {});
      }
    }
    if (kept) return kept;
  }
  return channel.send({
    ...payload,
    content: payload.content || undefined,
    flags: SUPPRESS_NOTIFICATIONS,
    allowedMentions: { parse: [] },
  });
}

module.exports = { placeSticky, SUPPRESS_NOTIFICATIONS };
