// "Send to Knowledge Bank" browser button (a bookmarklet). Clicked on a page the user is reading, it opens the
// Knowledge Bank's Sources tab with the link, title and text filled in for them to check and add. The page text travels
// in the URL's #fragment, which never reaches a server; nothing is sent until the user presses "Add and read".
export const SEND_HASH = "kb=";
export const SEND_MAX = 12_000;

export interface SentSource { url: string; title: string; text: string }

/** The bookmarklet's script for this site. Prefers selected text, then the Reddit post with its top comments (new and old Reddit), then the page's main text. YouTube sends just the link. */
export function bookmarkletSource(origin: string): string {
  const body = `(()=>{var L=${SEND_MAX},d=document,q=function(a,r){return(r||d).querySelector(a)},A=function(a,r){return[].slice.call((r||d).querySelectorAll(a))},
t=d.title,s=String(getSelection()||'').trim(),h=location.hostname,c=[];
if(!s&&/(^|\\.)youtube\\.com$|^youtu\\.be$/.test(h))s='';
else if(!s&&q('shreddit-post')){var p=q('shreddit-post');t=p.getAttribute('post-title')||t;var b=q('[slot=text-body]',p);s=b?b.innerText.trim():'';
A('shreddit-comment[depth="0"]').slice(0,15).forEach(function(e){var m=q('[slot=comment]',e);if(m)c.push('- ('+(e.getAttribute('score')||'?')+' points) '+m.innerText.trim())})}
else if(!s&&q('.thing.link')){var o=q('.thing.link');t=(q('a.title',o)||{}).innerText||t;var u=q('.usertext-body',o);s=u?u.innerText.trim():'';
A('.commentarea>.sitetable>.thing.comment').slice(0,15).forEach(function(e){var m=q('.entry .md',e),k=q('.entry .score.unvoted',e);if(m)c.push('- ('+(k?k.title||k.innerText:'?')+' points) '+m.innerText.trim())})}
else if(!s){s=(q('article')||q('main')||d.body).innerText.trim()}
if(c.length)s+=(s?'\\n\\n':'')+'Top comments:\\n'+c.join('\\n');
open('${origin}/fut/knowledge?tab=sources#${SEND_HASH}'+encodeURIComponent(JSON.stringify({u:location.href.split('#')[0],t:String(t).trim().slice(0,300),x:s.slice(0,L)})),'_blank')})()`;
  return `javascript:${encodeURIComponent(body.replace(/\n/g, ""))}`;
}

/** What the button sent, from a "#kb=…" fragment, or null. */
export function readSentSource(hash: string): SentSource | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith(SEND_HASH)) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw.slice(SEND_HASH.length))) as { u?: unknown; t?: unknown; x?: unknown };
    const url = typeof v.u === "string" && /^https:\/\/\S+$/.test(v.u) ? v.u.slice(0, 600) : "";
    return { url, title: typeof v.t === "string" ? v.t.slice(0, 300) : "", text: typeof v.x === "string" ? v.x.slice(0, SEND_MAX) : "" };
  } catch { return null; }
}
