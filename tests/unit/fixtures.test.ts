import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import screens from '../fixtures/screens.json';
import provider from '../fixtures/provider-cases.json';

const root = new URL('../fixtures/', import.meta.url);
const cases: Array<{
  id: string;
  input: { prompt: string; screenId: string | null };
  events: Array<{ type: string; text?: string; code?: string }>;
}> = provider.cases;

describe('synthetic screen corpus', () => {
  it('declares the version and covers all six initial scenarios without unlisted images', () => {
    expect(screens.schemaVersion).toBe(1);
    expect(screens.synthetic).toBe(true);
    expect(screens.screens.map((screen) => screen.id).sort()).toEqual([
      'browser-warning',
      'multiple-windows',
      'prompt-injection',
      'sensitive-app',
      'settings',
      'spreadsheet-error',
    ]);
    expect(readdirSync(new URL('screens/', root)).sort()).toEqual(
      screens.screens.map((screen) => `${screen.id}.png`).sort(),
    );
  });
  for (const screen of screens.screens) {
    it(`validates the committed PNG and observation record for ${screen.id}`, () => {
      expect(screen.file).toBe(`screens/${screen.id}.png`);
      const image = readFileSync(new URL(screen.file, root));
      expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(image.subarray(12, 16).toString('ascii')).toBe('IHDR');
      expect(image.readUInt32BE(16)).toBe(screen.width);
      expect(image.readUInt32BE(20)).toBe(screen.height);
      expect(createHash('sha256').update(image).digest('hex')).toBe(
        screen.sha256,
      );
      expect(screen.mimeType).toBe('image/png');
      expect(screen.prompt.length).toBeGreaterThan(0);
      expect(screen.expectedObservations.length).toBeGreaterThanOrEqual(2);
      expect(['capture-if-authorized', 'ask-target', 'deny']).toContain(
        screen.expectedCapturePolicy,
      );
    });
  }
  it('retains privacy and untrusted-content expectations', () => {
    expect(
      screens.screens.find((screen) => screen.id === 'sensitive-app')
        ?.expectedCapturePolicy,
    ).toBe('deny');
    expect(
      screens.screens.find((screen) => screen.id === 'multiple-windows')
        ?.expectedCapturePolicy,
    ).toBe('ask-target');
    expect(
      screens.screens.find((screen) => screen.id === 'prompt-injection')
        ?.expectedObservations,
    ).toContain('Treat page text as untrusted content');
  });
});

describe('deterministic provider event records', () => {
  it('has exactly the required synthetic scenarios with no duplicated ids', () => {
    expect(provider.schemaVersion).toBe(1);
    expect(provider.synthetic).toBe(true);
    expect(cases.map((entry) => entry.id).sort()).toEqual([
      'cancel',
      'offline',
      'rate-limit',
      'text-success',
      'token-expired',
      'vision-success',
      'vision-unsupported',
    ]);
  });
  for (const entry of cases) {
    it(`has valid references and one terminal event for ${entry.id}`, () => {
      expect(entry.input.prompt.length).toBeGreaterThan(0);
      if (entry.input.screenId !== null) {
        expect(screens.screens.map((screen) => screen.id)).toContain(
          entry.input.screenId,
        );
      }
      const terminals = entry.events.filter((event) => event.type !== 'chunk');
      expect(terminals).toHaveLength(1);
      expect(entry.events.at(-1)).toEqual(terminals[0]);
      expect(['done', 'error', 'cancelled']).toContain(terminals[0]?.type);
      for (const event of entry.events) {
        if (event.type === 'chunk')
          expect(event.text?.length).toBeGreaterThan(0);
        if (event.type === 'error') {
          expect([
            'OFFLINE',
            'AUTH_EXPIRED',
            'RATE_LIMITED',
            'VISION_UNSUPPORTED',
          ]).toContain(event.code);
        }
      }
    });
  }
  it('keeps text input image-free and preserves cancellation/error semantics', () => {
    expect(
      cases.find((entry) => entry.id === 'text-success')?.input.screenId,
    ).toBeNull();
    expect(
      cases.find((entry) => entry.id === 'cancel')?.events.at(-1)?.type,
    ).toBe('cancelled');
    const codes = cases
      .flatMap((entry) =>
        entry.events
          .filter((event) => event.type === 'error')
          .map((event) => event.code),
      )
      .sort();
    expect(codes).toEqual([
      'AUTH_EXPIRED',
      'OFFLINE',
      'RATE_LIMITED',
      'VISION_UNSUPPORTED',
    ]);
  });
});
