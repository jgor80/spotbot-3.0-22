import { ContactLink, LegalLayout } from "@/components/legal/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These terms cover your use of GafferBot, the Discord bot and the web dashboard that comes with it
        (together, "GafferBot"). By adding GafferBot to a server or using its commands, buttons or dashboard you
        agree to them. If you add GafferBot to a server, you confirm you are allowed to do so for that server.
      </p>

      <h2>What GafferBot is</h2>
      <p>
        GafferBot helps EA SPORTS FC Pro Clubs communities run their club on Discord: team sheets, availability,
        drafts, club and player stats, scouting and graphics. GafferBot is an independent project. It is not made,
        endorsed or sponsored by Discord, Electronic Arts, Microsoft or Twitch, and their names are used only to
        describe what GafferBot works with.
      </p>

      <h2>Your account and Discord's rules</h2>
      <ul>
        <li>You must follow Discord's Terms of Service and Community Guidelines while using GafferBot.</li>
        <li>You must be old enough to use Discord in your country.</li>
        <li>You are responsible for what you post through GafferBot, including names, photos and messages.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use GafferBot to:</p>
      <ul>
        <li>harass, threaten or impersonate anyone, or upload photos of people without their permission;</li>
        <li>upload sexual, violent, hateful or illegal content;</li>
        <li>spam, overload, reverse engineer or try to break GafferBot or get around its limits or paywall;</li>
        <li>collect other people's data from GafferBot for purposes unrelated to running your club.</li>
      </ul>
      <p>We may remove content, or stop GafferBot working for a user or server, that breaks these terms.</p>

      <h2>Stats and generated content</h2>
      <p>
        Match stats come from EA's public Pro Clubs data and may be late, incomplete or wrong. Some numbers (for
        example ratings, chemistry and "hidden" stats) are GafferBot's own estimates and are labelled as such.
        Images, rumours and roasts made by GafferBot are for fun and may be generated with AI; they are not
        statements of fact.
      </p>

      <h2>GafferBot Premium</h2>
      <ul>
        <li>
          Premium is a per-server subscription sold through Discord's app subscriptions. Discord handles payment,
          renewals, cancellation and refunds under its own terms; we never see your payment details.
        </li>
        <li>Premium stays active for the period you paid for. Cancel any time in Discord's settings.</li>
        <li>
          We may change which features are included in Premium. If a change removes a major feature you paid for,
          you can ask Discord for a refund under its refund policy.
        </li>
      </ul>

      <h2>Availability</h2>
      <p>
        GafferBot is provided "as is". We try to keep it running but do not promise it will always be available,
        error-free, or that data will never be lost. It depends on services we do not control, including Discord,
        EA, Xbox, Twitch and our hosting providers.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, and our total
        liability to you is limited to what you paid for GafferBot Premium in the 12 months before the claim.
        Nothing here limits rights you have under consumer law that cannot be excluded.
      </p>

      <h2>Changes and ending</h2>
      <p>
        We may update these terms; the date at the top shows the latest version, and continuing to use GafferBot
        means you accept it. You can stop using GafferBot at any time by removing it from your server. See the
        Privacy Policy for how to have your data deleted.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <ContactLink />.
      </p>
    </LegalLayout>
  );
}
