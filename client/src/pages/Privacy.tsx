import LegalPage from "@/components/legal/LegalPage";
import privacyMarkdown from "../content/legal/privacy.md?raw";

export default function Privacy() {
  return <LegalPage markdown={privacyMarkdown} />;
}
