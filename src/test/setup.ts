import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearBriefingCache } from '../lib/briefing-client';

// Node 22 can expose an unusable global Web Storage object; tests use jsdom's origin-scoped storage.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: window.localStorage });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: window.sessionStorage });

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
afterEach(() => { cleanup(); clearBriefingCache(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
