import { beforeAll } from "vitest";

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: ((type: string) => {
      if (type !== "2d") return null;
      return {
        setTransform: () => undefined,
        createLinearGradient: () => gradientStub(),
        createRadialGradient: () => gradientStub(),
        fillRect: () => undefined,
        beginPath: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        fillStyle: "",
        globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D;
    }) as HTMLCanvasElement["getContext"],
  });

  if (typeof HTMLDialogElement !== "undefined") {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      },
    });
  }
});

function gradientStub(): CanvasGradient {
  return {
    addColorStop: () => undefined,
  } as unknown as CanvasGradient;
}
