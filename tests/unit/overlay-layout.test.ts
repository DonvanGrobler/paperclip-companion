import { describe, expect, it } from 'vitest';
import { initialOverlayBounds } from '../../src/main/overlay-layout';

describe('initial overlay bounds', () => {
  it('places the compact window inside the bottom right of the work area', () => {
    expect(
      initialOverlayBounds({ x: 0, y: 0, width: 1920, height: 1040 }),
    ).toEqual({ x: 1616, y: 676, width: 280, height: 340 });
  });
  it('honors a negative monitor origin', () => {
    expect(
      initialOverlayBounds({ x: -1280, y: -200, width: 1280, height: 960 }),
    ).toEqual({ x: -304, y: 396, width: 280, height: 340 });
  });
  it('fits a small work area instead of placing the window outside it', () => {
    expect(
      initialOverlayBounds({ x: 10, y: 20, width: 200, height: 220 }),
    ).toEqual({ x: 10, y: 20, width: 200, height: 220 });
  });
});

it('keeps bounds on the most overlapping display and handles removed monitors and small work areas', async () => {
  const { fitBounds } = await import('../../src/main/overlay-layout');
  const primary = { x: 0, y: 0, width: 1000, height: 700 };
  const left = { x: -1200, y: -200, width: 1200, height: 900 };
  expect(
    fitBounds(
      { x: -800, y: 50, width: 280, height: 340 },
      [left, primary],
      primary,
    ),
  ).toEqual({ x: -800, y: 50, width: 280, height: 340 });
  expect(
    fitBounds({ x: -800, y: 50, width: 280, height: 340 }, [primary], primary),
  ).toEqual({ x: 0, y: 50, width: 280, height: 340 });
  expect(
    fitBounds({ x: 900, y: 600, width: 280, height: 340 }, [], primary),
  ).toEqual({ x: 720, y: 360, width: 280, height: 340 });
  expect(
    fitBounds(
      { x: 0, y: 0, width: 640, height: 680 },
      [{ x: 10, y: 20, width: 200, height: 220 }],
      primary,
    ),
  ).toEqual({ x: 10, y: 20, width: 200, height: 220 });
});
