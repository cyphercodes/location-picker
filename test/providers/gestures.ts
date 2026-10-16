// Synthetic multi-touch for the browser project (Playwright has no pinch API). Like e2e/core.spec.ts: what a touch
// screen produces, pointer events per finger, then touch events where the engine has TouchEvent (Leaflet listens to
// touch events when they exist and emulates them from pointer events otherwise).
export interface Point {
  readonly x: number;
  readonly y: number;
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Two fingers from `starts`, each moved by `deltas[i]` over `steps` animation frames. */
export async function touchGesture(
  target: HTMLElement,
  starts: readonly Point[],
  deltas: readonly Point[],
  steps = 8,
): Promise<void> {
  const at = (step: number): Point[] =>
    starts.map((start, i) => ({
      x: start.x + ((deltas[i]?.x ?? 0) * step) / steps,
      y: start.y + ((deltas[i]?.y ?? 0) * step) / steps,
    }));
  const touchSupport = typeof TouchEvent == 'function' && typeof Touch == 'function';
  const touches = (points: readonly Point[]): Touch[] =>
    touchSupport
      ? points.map((p, identifier) => new Touch({ identifier, target, clientX: p.x, clientY: p.y }))
      : [];
  const pointers = (type: string, points: readonly Point[]): void => {
    for (const [i, p] of points.entries()) {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 10 + i,
          pointerType: 'touch',
          isPrimary: i == 0,
          clientX: p.x,
          clientY: p.y,
          buttons: type == 'pointerup' ? 0 : 1,
        }),
      );
    }
  };
  const touch = (type: string, points: readonly Point[], changed: readonly Point[]): void => {
    if (!touchSupport) return;
    const list = touches(points);
    target.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: list,
        targetTouches: list,
        changedTouches: touches(changed),
      }),
    );
  };
  const first = at(0);
  pointers('pointerdown', first);
  touch('touchstart', first, first);
  let last = first;
  for (let step = 1; step <= steps; step++) {
    last = at(step);
    pointers('pointermove', last);
    touch('touchmove', last, last);
    // oxlint-disable-next-line no-await-in-loop -- one move per animation frame, in order
    await frame();
  }
  pointers('pointerup', last);
  touch('touchend', [], last);
}

/** The centre of `element` in client coordinates. */
export function centreOf(element: Element): Point {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
