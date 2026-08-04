import { useState } from "react";

export function CookieConsent() {
  const [accepted, setAccepted] = useState(() => localStorage.getItem("mdn_cookie_ok") === "1");
  if (accepted) return null;

  return (
    <div className="cookie-bar">
      <p>Folosim cookie-uri necesare pentru coș, autentificare și funcționarea aplicației.</p>
      <button
        onClick={() => {
          localStorage.setItem("mdn_cookie_ok", "1");
          setAccepted(true);
        }}
      >
        Accept
      </button>
    </div>
  );
}
