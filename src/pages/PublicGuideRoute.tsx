import { useLocation } from "react-router-dom";
import { GuideArticle, GuidesIndex, FaqPage } from "@/pages/GuidePage";
import { HOME_FAQ, allFaq, guideBySlug } from "@/content/guides";
import NotFound from "@/pages/NotFound";

// One lazy chunk for every public guide route: /guides, /faq and /<guide slug>
export default function PublicGuideRoute() {
  const path = useLocation().pathname.replace(/\/+$/, "") || "/";
  if (path === "/guides") return <GuidesIndex />;
  if (path === "/faq") return <FaqPage faq={allFaq(HOME_FAQ)} />;
  const guide = guideBySlug(path.slice(1));
  return guide ? <GuideArticle guide={guide} /> : <NotFound />;
}
