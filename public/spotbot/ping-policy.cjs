// Who a bot message may ping when the message doesn't say.
// GafferBot never pings players one by one: game posts ping a role (the signed-players role for
// league games) or @everyone. A message that tags a player without its own allowedMentions shows
// the name but notifies nobody. Leader alerts that must reach one leader set
// allowedMentions.users themselves.
const DEFAULT_ALLOWED_MENTIONS = Object.freeze({ parse: ['roles', 'everyone'], repliedUser: false });

module.exports = { DEFAULT_ALLOWED_MENTIONS };
