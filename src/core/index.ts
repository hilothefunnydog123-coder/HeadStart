/**
 * Registers the built-in traffic providers. Import this module once at app
 * startup (see src/main.tsx) before any planning happens.
 */
import { registerProvider } from "./traffic/provider";
import { simulatedProvider } from "./traffic/simulated";
import { googleProvider } from "./traffic/google";
import { hostedProvider } from "./traffic/hosted";

registerProvider(simulatedProvider);
registerProvider(googleProvider);
registerProvider(hostedProvider);

export { simulatedProvider, googleProvider, hostedProvider };
