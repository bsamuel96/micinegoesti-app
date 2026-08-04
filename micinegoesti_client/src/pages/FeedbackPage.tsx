import { Link } from "react-router-dom";

const feedbackFlowUrl = "/feedback-flow/";

export function FeedbackPage() {
  return (
    <section className="feedback-page">
      <Link className="feedback-page-close" to="/" aria-label="Înapoi la homepage">×</Link>
      <iframe
        className="feedback-page-frame"
        src={feedbackFlowUrl}
        title="Formular feedback"
        loading="eager"
      />
    </section>
  );
}
