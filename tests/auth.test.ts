import { beforeEach, describe, expect, it } from "vitest";
import {
  getCurrentUser,
  signIn,
  signOut,
  signUp,
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
