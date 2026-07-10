import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { updateProfile, type AuthUser } from "../state/auth";
import { Icon } from "./Icon";

interface Props {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export function AccountMenu({
  user,
  onUserChange,
  onOpenSettings,
  onSignOut,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const profileDialogRef = useRef<HTMLDialogElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>("[role='menuitem']")
        ?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const dialog = profileDialogRef.current;
    if (!dialog) return;
    if (profileOpen && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => nameInputRef.current?.focus());
    }
    if (!profileOpen && dialog.open) dialog.close();
  }, [profileOpen]);

  const openProfile = () => {
    setMenuOpen(false);
    setName(user.name);
    setError(null);
    setProfileOpen(true);
  };

  const closeProfile = () => {
    setProfileOpen(false);
    setError(null);
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = updateProfile(user.id, { name });
      onUserChange(result.user);
      closeProfile();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Your profile could not be updated.",
      );
    }
  };

  const moveMenuFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div className="account-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-chip account-menu-trigger"
        aria-label={`Open profile menu for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <AccountAvatar user={user} />
        <span className="account-chip-copy">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>
        <Icon className="account-menu-chevron" name="chevron" size={15} />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="account-menu-popover"
          role="menu"
          aria-label="Profile menu"
          onKeyDown={moveMenuFocus}
        >
          <div className="account-menu-summary">
            <AccountAvatar user={user} />
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <div className="account-menu-items">
            <button type="button" role="menuitem" onClick={openProfile}>
              <span>Profile settings</span>
              <small>Edit your display name</small>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings();
              }}
            >
              <span>App settings</span>
              <small>Timing, alerts, and saved places</small>
            </button>
            <button
              type="button"
              role="menuitem"
              className="account-menu-signout"
              onClick={onSignOut}
            >
              <span>Sign out</span>
              <small>Return to the sign-in screen</small>
            </button>
          </div>
        </div>
      )}

      <dialog
        ref={profileDialogRef}
        className="profile-dialog"
        aria-labelledby="profile-dialog-title"
        aria-describedby="profile-dialog-description"
        onCancel={closeProfile}
        onClose={() => setProfileOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeProfile();
        }}
      >
        <form className="profile-dialog-card" onSubmit={saveProfile}>
          <div className="profile-dialog-heading">
            <div>
              <span className="page-kicker">Account</span>
              <h2 id="profile-dialog-title">Profile settings</h2>
              <p id="profile-dialog-description">
                Choose how your account appears in Departure.
              </p>
            </div>
            <button
              type="button"
              className="dialog-close"
              aria-label="Close profile settings"
              onClick={closeProfile}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <div className="profile-dialog-identity">
            <AccountAvatar user={user} />
            <span>
              <strong>{name.trim() || user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>

          <label className="field">
            <span>Display name</span>
            <input
              ref={nameInputRef}
              type="text"
              autoComplete="name"
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              required
            />
          </label>
          <label className="field profile-readonly-field">
            <span>Email</span>
            <input type="email" value={user.email} readOnly />
            <small>Your sign-in email cannot be changed here.</small>
          </label>

          <div className="profile-account-details">
            <span>
              Signed in with{" "}
              {user.authMethods
                .map((method) => (method === "google" ? "Google" : "email"))
                .join(" and ")}
            </span>
            <span>Member since {formatMemberSince(user.createdAt)}</span>
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <div className="profile-dialog-actions">
            <button type="button" className="secondary-button" onClick={closeProfile}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!name.trim() || name.trim() === user.name}
            >
              Save profile
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function AccountAvatar({ user }: { user: AuthUser }) {
  return user.avatarUrl ? (
    <img
      className="account-avatar-image"
      src={user.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="account-avatar" aria-hidden>
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function formatMemberSince(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date);
}
