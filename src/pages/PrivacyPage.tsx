import { ContactLink, LegalLayout } from "@/components/legal/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This policy explains what GafferBot (the Discord bot and its web dashboard) collects, why, who it is shared
        with, and how to have it deleted. We do not sell personal data or use it for advertising.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Discord data:</strong> your user ID, username, display name and avatar; the IDs and names of
          servers, channels and roles GafferBot is used in; your server roles (to keep club rosters in sync); and
          when you join or leave voice channels in servers that use GafferBot (to record sessions and attendance).
        </li>
        <li>
          <strong>Messages:</strong> GafferBot does not store message text. In a server's #pro-photos channel it
          reads messages only to pick up image attachments you post there.
        </li>
        <li>
          <strong>What you give GafferBot:</strong> your EA / Xbox gamertag, positions, availability, team sheet
          and draft choices, ratings and feedback you give other players, scouting notes, Twitch channel name, and
          photos you upload for player cards.
        </li>
        <li>
          <strong>Game data:</strong> match results and per-player stats for linked clubs from EA's public Pro
          Clubs data, and whether a linked Xbox gamertag is currently playing, from OpenXBL.
        </li>
        <li>
          <strong>Dashboard accounts:</strong> your email address and sign-in details, if you create a dashboard
          account.
        </li>
        <li>
          <strong>Premium:</strong> which servers hold a GafferBot Premium subscription, as reported by Discord.
          Discord handles payment; we never receive card or billing details.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run GafferBot's features: club rosters, team sheets and notifications, stats, ratings and
        insights, scouting and recruitment, player cards and graphics, Twitch live alerts, Premium access, and
        keeping the service secure and working. Stats and profiles you link are shared across servers that use
        GafferBot, so a link you make in one server also shows in another.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li>
          <strong>Other members of your server</strong> see the club information GafferBot posts there (team
          sheets, stats, ratings, graphics).
        </li>
        <li>
          <strong>Service providers</strong> that process data for us: Supabase (database, file storage and
          backend functions), our bot hosting provider, Lovable (web hosting and its AI gateway), and OpenAI.
          Uploaded photos, and stats used for AI-written recaps and coaching notes, are sent to the AI providers
          to check photos and generate artwork and text.
        </li>
        <li>
          <strong>Services GafferBot looks data up from:</strong> Discord, EA, OpenXBL and Twitch receive the
          requests needed to fetch your data (for example a gamertag or channel name).
        </li>
        <li>When the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        We keep data while GafferBot is used for your club. Season stats are archived so past seasons stay
        viewable. Uploaded photos are kept privately until you ask for them to be removed. When
        we receive a deletion request we delete or anonymise your data within 30 days, except where we must keep
        it by law.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>You can update your availability, positions and profile details through the bot at any time.</li>
        <li>
          You can ask for a copy of your data, or for it to be corrected or deleted, by emailing{" "}
          <ContactLink /> with your Discord username and user ID.
        </li>
        <li>
          Server admins can remove GafferBot from their server at any time and ask us to delete that server's
          data the same way.
        </li>
        <li>
          If you are in the EU or UK you also have the right to object to processing and to complain to your
          data protection authority.
        </li>
      </ul>

      <h2>Children</h2>
      <p>GafferBot is not meant for anyone under the minimum age to use Discord in their country.</p>

      <h2>Security</h2>
      <p>
        Data is stored with access controls, and uploaded photos are kept in private storage. No system is
        perfectly secure, so please do not upload anything you would not want others in your server to see.
      </p>

      <h2>Changes</h2>
      <p>We will update the date at the top when this policy changes.</p>

      <h2>Contact</h2>
      <p>
        Privacy questions and data requests: <ContactLink />.
      </p>
    </LegalLayout>
  );
}
