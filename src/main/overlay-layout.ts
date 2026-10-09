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

/** Select the largest intersection, fall back to primary, and fit entirely in DIP. */
export function fitBounds(
  bounds: Rectangle,
  areas: Rectangle[],
  primary: Rectangle,
): Rectangle {
  let area = primary;
  let largest = 0;
  for (const candidate of areas) {
    const overlap =
      Math.max(
        0,
        Math.min(bounds.x + bounds.width, candidate.x + candidate.width) -
          Math.max(bounds.x, candidate.x),
      ) *
      Math.max(
        0,
        Math.min(bounds.y + bounds.height, candidate.y + candidate.height) -
          Math.max(bounds.y, candidate.y),
      );
    if (overlap > largest) {
      largest = overlap;
      area = candidate;
    }
  }
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
}
