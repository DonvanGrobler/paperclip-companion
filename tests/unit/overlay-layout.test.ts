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
