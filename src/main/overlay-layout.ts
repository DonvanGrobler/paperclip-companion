interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Work-area coordinates come from Electron, in device-independent pixels. */
export function initialOverlayBounds(area: Rectangle): Rectangle {
  const width = Math.min(280, area.width);
  const height = Math.min(340, area.height);
  return {
    x: area.x + Math.max(0, area.width - width - 24),
    y: area.y + Math.max(0, area.height - height - 24),
    width,
    height,
  };
}
