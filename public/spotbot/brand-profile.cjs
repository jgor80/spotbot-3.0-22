// Keeps the bot's Discord avatar and profile banner in step with the files in ./brand.
// Runs once at startup and only calls Discord when the images changed since the last
// successful apply (Discord rate-limits avatar changes), so restarts cost nothing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BRAND_DIR = path.join(__dirname, 'brand');
const STATE_FILE = process.env.BRAND_STATE_FILE || path.join(__dirname, '.brand-applied');

function readIfExists(file) {
  try { return fs.readFileSync(file); } catch { return null; }
}

async function applyBrandProfile(client) {
  if (process.env.BRAND_PROFILE === 'off') return false;
  const avatar = readIfExists(path.join(BRAND_DIR, 'avatar.png'));
  const banner = readIfExists(path.join(BRAND_DIR, 'banner.png'));
  if (!avatar && !banner) return false;

  const hash = crypto.createHash('sha256').update(avatar || '').update(banner || '').digest('hex');
  const applied = (readIfExists(STATE_FILE) || '').toString().trim();
  if (applied === hash) return false;

  const edit = {};
  if (avatar) edit.avatar = avatar;
  if (banner) edit.banner = banner;
  try {
    await client.user.edit(edit);
  } catch (e) {
    // Banner needs a newer Discord API path on some accounts; keep the avatar change if it fails.
    if (edit.banner && avatar) {
      console.warn('[brand] banner update failed, retrying avatar only:', e.message);
      await client.user.setAvatar(avatar);
    } else {
      throw e;
    }
  }
  try { fs.writeFileSync(STATE_FILE, hash); } catch (e) { console.warn('[brand] could not save state:', e.message); }
  console.log('🎨 Bot avatar and banner updated from ./brand');
  return true;
}

module.exports = { applyBrandProfile };
