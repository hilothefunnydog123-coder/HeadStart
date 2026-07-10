import { useState, type FormEvent } from "react";
import {
  configuredGoogleClientId,
  requestGoogleAccountProfile,
} from "../core/googleCalendar";
import {
  signIn,
  signInWithGoogle,
  signUp,
  type AuthUser,
} from "../state/auth";
import { Icon } from "./Icon";

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "signin" | "signup";

const GOOGLE_CLIENT_ID = configuredGoogleClientId();

export function AuthPanel({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const continueWithGoogle = async () => {
    setError(null);
    if (!GOOGLE_CLIENT_ID) {
      setError("Google sign-in is still being configured for this site.");
      return;
    }

    setBusy(true);
    try {
      const profile = await requestGoogleAccountProfile(GOOGLE_CLIENT_ID);
      const result = await signInWithGoogle(profile);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in with Google.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (isSignup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = isSignup
        ? await signUp({ name, email, password })
        : await signIn({ email, password });
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden>
            <Icon name="alarm" size={24} strokeWidth={1.8} />
          </span>
          <div>
            <h1 id="auth-title" className="brand-title">Departure</h1>
            <p className="brand-tag">Wake up exactly when you need to.</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Account action">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={`auth-tab ${!isSignup ? "auth-tab-active" : ""}`}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={`auth-tab ${isSignup ? "auth-tab-active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>

        <div className="auth-heading">
          <span className="page-kicker">Your morning, handled</span>
          <h2>{isSignup ? "Create your Departure account" : "Welcome back"}</h2>
          <p>
            {isSignup
              ? "Save your schedule and keep calendar access private."
              : "Sign in to see when to wake up, get ready, and leave."}
          </p>
        </div>

        <button
          type="button"
          className="social-auth-button"
          disabled={busy}
          onClick={() => void continueWithGoogle()}
        >
          <span className="google-mark" aria-hidden>G</span>
          Continue with Google
        </button>

        <div className="auth-divider" aria-hidden>
          <span>or use email</span>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {isSignup && (
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </label>

          {isSignup && (
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
                required
                minLength={8}
              />
            </label>
          )}

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="primary-button auth-submit" disabled={busy}>
            {busy ? "Checking..." : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="auth-footnote">
          Your schedule and saved places stay tied to this account on this device.
        </p>
      </section>
    </main>
  );
}
