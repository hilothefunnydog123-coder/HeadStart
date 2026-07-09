import { useState, type FormEvent } from "react";
import { signIn, signUp, type AuthUser } from "../state/auth";
import { Icon } from "./Icon";

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

type AuthMode = "signin" | "signup";

export function AuthPanel({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

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
      </section>
    </main>
  );
}
