// OBS / Streamlabs browser source: the club's XI on a mini pitch with tonight's EA ratings.
// Public route (no login): the token in the URL is a per-server secret from /premium overlay.
// Transparent background; refreshes every 30 seconds.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FORMATIONS } from "@/lib/formations";
import type { FormationType } from "@/types/formations";

const REFRESH_MS = 30_000;

interface OverlayPlayer {
  position: string;
  slot: number;
  substitute: boolean;
  name: string;
  games: number;
  rating: number | null;
  goals: number;
  assists: number;
}

interface OverlayData {
  club: { name: string; key: string };
  branding: { color: number | null; logo_url: string | null };
  formation: string | null;
  players: OverlayPlayer[];
  session: { matches: number; wins: number; draws: number; losses: number; last: { score_for: number; score_against: number; opponent: string } | null };
  error?: string;
}

function formationSpots(formation: string | null) {
  const keys = Object.keys(FORMATIONS) as FormationType[];
  const key = keys.find((k) => k === formation) ?? keys.find((k) => formation && k.startsWith(formation)) ?? "4-3-3 FLAT";
  return FORMATIONS[key as FormationType] ?? [];
}

function ratingColor(rating: number | null) {
  if (rating == null) return "#64748b";
  if (rating >= 8) return "#22c55e";
  if (rating >= 7) return "#eab308";
  return "#ef4444";
}

export default function StreamOverlay() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const club = params.get("club") ?? "";
  const [data, setData] = useState<OverlayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // OBS composites the page over the stream, so nothing may paint a background
  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById("root")];
    const before = els.map((el) => el?.style.background ?? "");
    els.forEach((el) => el && (el.style.background = "transparent"));
    return () => els.forEach((el, i) => el && (el.style.background = before[i]));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: res, error: err } = await supabase.functions.invoke("stream-overlay", { body: { token, club } });
      if (!alive) return;
      if (err || res?.error) setError(res?.error ?? "Overlay data is unavailable right now");
      else {
        setError(null);
        setData(res as OverlayData);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, club]);

  if (error && !data) {
    return <div style={{ padding: 16, color: "#fff", font: "600 18px Inter, sans-serif", textShadow: "0 1px 3px #000" }}>{error}</div>;
  }
  if (!data) return null;

  const accent = data.branding.color != null ? `#${data.branding.color.toString(16).padStart(6, "0")}` : "#22c55e";
  const spots = formationSpots(data.formation);
  const starters = data.players.filter((p) => !p.substitute);
  const s = data.session;

  return (
    <div style={{ position: "fixed", left: 24, bottom: 24, width: 380, fontFamily: "Inter, system-ui, sans-serif", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(11,18,32,0.88)", borderTop: `4px solid ${accent}`, borderRadius: "12px 12px 0 0", padding: "10px 14px" }}>
        {data.branding.logo_url && <img src={data.branding.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 16, objectFit: "cover" }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.club.name}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {s.matches ? `Tonight ${s.wins}W ${s.draws}D ${s.losses}L` : "No matches yet tonight"}
            {s.last ? ` · last ${s.last.score_for}-${s.last.score_against} vs ${s.last.opponent}` : ""}
          </div>
        </div>
        {data.formation && <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{data.formation}</div>}
      </div>
      <div style={{ position: "relative", height: 470, background: "rgba(20,83,45,0.85)", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 10, border: "2px solid rgba(255,255,255,0.35)", borderRadius: 6 }} />
        <div style={{ position: "absolute", left: 10, right: 10, top: "50%", borderTop: "2px solid rgba(255,255,255,0.35)" }} />
        {starters.map((p) => {
          const spot = spots[p.slot];
          if (!spot) return null;
          return (
            <div key={p.slot} style={{ position: "absolute", left: `${spot.x}%`, top: `${Math.min(Math.max(spot.y, 8), 92)}%`, transform: "translate(-50%, -50%)", textAlign: "center", width: 88 }}>
              <div style={{ margin: "0 auto", width: 34, height: 34, borderRadius: 17, background: ratingColor(p.rating), border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "#0b1220" }}>
                {p.rating != null ? p.rating.toFixed(1) : p.position}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 2px #000" }}>{p.name}</div>
              {(p.goals > 0 || p.assists > 0) && (
                <div style={{ fontSize: 10, color: "#fde68a", textShadow: "0 1px 2px #000" }}>
                  {p.goals > 0 ? `${p.goals}G` : ""} {p.assists > 0 ? `${p.assists}A` : ""}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ position: "absolute", right: 12, bottom: 8, fontSize: 10, color: "rgba(255,255,255,0.6)" }}>GafferBot</div>
      </div>
    </div>
  );
}
