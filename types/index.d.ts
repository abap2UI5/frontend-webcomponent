/*
 * @abap2ui5/frontend-webcomponent - the types of the custom element, its
 * events and the exported building blocks. The element's configuration is
 * its attributes (see README "Embedding").
 */

export interface Abap2UI5RouteDetail {
  action: 'push' | 'replace' | 'back';
  /** '#...' or '' - absent for 'back' */
  hash?: string;
  app: string | null;
  id: string | null;
}

export interface Abap2UI5ResponseDetail {
  app: string;
  id: string;
  slots: string[];
}

export interface Abap2UI5MessageDetail {
  type: 'toast' | 'box';
  text: string;
  boxType?: string;
}

export interface Abap2UI5ErrorDetail {
  message: string;
  status?: number;
  /** a roundtrip that never reached the backend or met a 502/503: the error dialog offers Retry */
  retry: boolean;
}

export interface Abap2UI5Diagnostic {
  kind: string;
  detail: string;
  control?: string;
  count: number;
  app: string;
}

export interface Abap2UI5AppEventMap {
  'abap2ui5-response': CustomEvent<Abap2UI5ResponseDetail>;
  'abap2ui5-request': CustomEvent<{ body: unknown }>;
  'abap2ui5-message': CustomEvent<Abap2UI5MessageDetail>;
  'abap2ui5-title': CustomEvent<{ title: string }>;
  'abap2ui5-error': CustomEvent<Abap2UI5ErrorDetail>;
  'abap2ui5-diagnostic': CustomEvent<Abap2UI5Diagnostic>;
  'abap2ui5-route': CustomEvent<Abap2UI5RouteDetail>;
}

/** A transport of your own in place of fetch (set before the element connects). */
export interface Transport {
  roundtrip(body: unknown, options?: { signal?: AbortSignal }): Promise<{ status: number; ok: boolean; body: string; bytes?: number }>;
  endSession?(): void;
}

export declare class Session {
  readonly app: string | null;
  readonly state: { app: string | null; id: string | null; slots: Record<string, unknown>; models: Record<string, unknown> };
  readonly busy: boolean;
  readonly lastRequest: unknown;
  readonly lastResponse: unknown;
  readonly roundtrips: number;
  start(app: string): Promise<unknown>;
  fire(slot: string, event: string, args?: unknown[], flags?: { useMainModel?: boolean; queueLast?: boolean; noBusy?: boolean; hash?: string }): Promise<unknown>;
  /** re-send the last request (the same body); null when there is none or a roundtrip runs */
  retry(): Promise<unknown>;
  closeSlot(slot: string): void;
  on(type: 'response' | 'busy' | 'error' | 'request', fn: (payload: any) => void): () => void;
  end(): void;
}

export declare class ProtocolError extends Error {
  status?: number;
  retry: boolean;
}

export declare const PROTOCOL: number;

export declare class Abap2UI5App extends HTMLElement {
  /** extra request headers (Authorization, sap-client); a new object assigned later is used from the next request on */
  headers: Record<string, string>;
  /** a transport of your own - set before the element connects */
  transport: Transport | null;
  readonly session: Session | null;
  readonly diagnostics: Abap2UI5Diagnostic[];
  /** a hash change of the host (routing="events"), or the hash to go to (routing="hash") */
  navigate(hash: string): void;
  restart(): void;
  addEventListener<K extends keyof Abap2UI5AppEventMap>(type: K, listener: (this: Abap2UI5App, ev: Abap2UI5AppEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof Abap2UI5AppEventMap>(type: K, listener: (this: Abap2UI5App, ev: Abap2UI5AppEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'abap2ui5-app': Abap2UI5App;
  }
}

/** Register the element under `name` (default 'abap2ui5-app'); importing the module does it already. */
export declare function defineElement(name?: string): void;

export declare function createFetchTransport(options: {
  endpoint: string;
  credentials?: RequestCredentials;
  csrf?: 'auto' | 'fetch' | 'none' | string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Transport & { state: { contextId: string | null; csrfToken: string } };

/** Add or extend the frontend's own texts of a language ('fr'); the keys are those of src/ui/texts.js. */
export declare function defineTexts(language: string, texts: Record<string, string>): void;

/** A mapper for a control of your own (`z2ui5.cc.MyControl`); see src/render/registry.js for the shape. */
export declare function defineControl(name: string, mapper: Record<string, unknown>): void;
export declare function listControls(): Array<Record<string, unknown>>;

export declare class FrontendApp {
  constructor(options: Record<string, unknown>);
  start(app: string): Promise<void>;
  destroy(): void;
  setTheme(name: string): Promise<void>;
  setLanguage(language: string): Promise<void>;
}

export declare class Renderer {
  constructor(options: Record<string, unknown>);
}

export declare class Model {
  constructor(key: string, data?: unknown);
  get(path: string): unknown;
  set(path: string, value: unknown, options?: { notify?: boolean }): void;
  replace(data: unknown): void;
  subscribe(fn: () => void): () => void;
}

export declare function createActions(options: Record<string, unknown>): { run(item: unknown, slot?: string): void; cancelTimers(): void; supported(): string[] };
export declare function compileProperty(raw: string): Record<string, unknown>;
export declare function compileAggregation(raw: string): Record<string, unknown> | null;
