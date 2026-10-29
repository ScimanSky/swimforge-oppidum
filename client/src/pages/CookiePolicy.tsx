import LegalPage from "@/components/legal/LegalPage";
import cookieMarkdown from "../content/legal/cookies.md?raw";

export default function CookiePolicy() {
  return <LegalPage markdown={cookieMarkdown} />;
}
