import { beforeEach, describe, expect, it } from "vitest";
import {
  getCurrentUser,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  updateProfile,
} from "../src/state/auth";

describe("auth storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a user, stores a session, and signs back in", async () => {
    const created = await signUp({
      name: "Morning Person",
      email: "MORNING@example.com",
      password: "wake-up-now",
    });

    expect(created.user.email).toBe("morning@example.com");
    expect(created.user.name).toBe("Morning Person");
    expect(created.user.authMethods).toEqual(["password"]);
    expect(getCurrentUser()?.id).toBe(created.user.id);

    signOut();
    expect(getCurrentUser()).toBeNull();

    const signedIn = await signIn({
      email: "morning@example.com",
      password: "wake-up-now",
    });

    expect(signedIn.user.id).toBe(created.user.id);
    expect(getCurrentUser()?.id).toBe(created.user.id);
  });

  it("creates and reuses an account from a verified Google profile", async () => {
    const created = await signInWithGoogle({
      sub: "google-subject-123",
      email: "STUDENT@example.com",
      name: "Student Name",
      picture: "https://example.com/avatar.png",
    });

    expect(created.user.id).toBe("google-google-subject-123");
    expect(created.user.email).toBe("student@example.com");
    expect(created.user.authMethods).toEqual(["google"]);
    expect(getCurrentUser()?.id).toBe(created.user.id);

    signOut();
    const signedInAgain = await signInWithGoogle({
      sub: "google-subject-123",
      email: "student@example.com",
      name: "Updated Name",
    });

    expect(signedInAgain.user.id).toBe(created.user.id);
    expect(signedInAgain.user.name).toBe("Updated Name");
  });

  it("links Google to an existing verified-email account", async () => {
    const passwordAccount = await signUp({
      email: "linked@example.com",
      password: "wake-up-now",
    });
    signOut();

    const linked = await signInWithGoogle({
      sub: "linked-google-subject",
      email: "linked@example.com",
      name: "Linked Person",
    });

    expect(linked.user.id).toBe(passwordAccount.user.id);
    expect(linked.user.authMethods).toEqual(["password", "google"]);
  });

  it("updates the profile name without letting Google overwrite it later", async () => {
    const created = await signInWithGoogle({
      sub: "custom-name-subject",
      email: "custom@example.com",
      name: "Google Name",
    });

    const updated = updateProfile(created.user.id, { name: "Preferred Name" });
    expect(updated.user.name).toBe("Preferred Name");
    expect(getCurrentUser()?.name).toBe("Preferred Name");

    signOut();
    const signedInAgain = await signInWithGoogle({
      sub: "custom-name-subject",
      email: "custom@example.com",
      name: "Changed Google Name",
    });
    expect(signedInAgain.user.name).toBe("Preferred Name");
  });

  it("rejects duplicate accounts and wrong passwords", async () => {
    await signUp({
      email: "person@example.com",
      password: "wake-up-now",
    });

    await expect(
      signUp({
        email: "PERSON@example.com",
        password: "wake-up-now",
      }),
    ).rejects.toThrow("already exists");

    await expect(
      signIn({
        email: "person@example.com",
        password: "not-the-password",
      }),
    ).rejects.toThrow("incorrect");
  });

  it("validates email and password before creating an account", async () => {
    await expect(
      signUp({
        email: "not-an-email",
        password: "wake-up-now",
      }),
    ).rejects.toThrow("valid email");

    await expect(
      signUp({
        email: "short@example.com",
        password: "short",
      }),
    ).rejects.toThrow("at least 8 characters");

    expect(getCurrentUser()).toBeNull();
  });
});
