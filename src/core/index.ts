/**
 * Registers the built-in traffic providers. Import this module once at app
 * startup (see src/main.tsx) before any planning happens.
 */
import { registerProvider } from "./traffic/provider";
import { simulatedProvider } from "./traffic/simulated";
import { googleProvider } from "./traffic/google";

registerProvider(simulatedProvider);
registerProvider(googleProvider);

export { simulatedProvider, googleProvider };
