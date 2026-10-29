import LegalPage from "@/components/legal/LegalPage";
import termsMarkdown from "../content/legal/terms.md?raw";

export default function Terms() {
  return <LegalPage markdown={termsMarkdown} />;
}
