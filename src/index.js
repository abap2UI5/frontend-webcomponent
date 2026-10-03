/*
 * @abap2ui5/frontend-webcomponent - the ESM entry (dist/abap2ui5-wc.js).
 *
 * Importing it registers <abap2ui5-app>. The building blocks are exported
 * for hosts that want the protocol client or the renderer on their own.
 */
import './render/webcomponents.js';
import { defineElement, Abap2UI5App } from './element.js';

export { defineElement, Abap2UI5App };
export { FrontendApp } from './ui/app.js';
export { Session, ProtocolError, PROTOCOL } from './core/session.js';
export { createFetchTransport } from './core/transport.js';
export { createActions } from './core/actions.js';
export { Renderer } from './render/renderer.js';
export { define as defineControl, list as listControls } from './render/registry.js';
export { compileProperty, compileAggregation } from './bindings/binding.js';
export { Model } from './bindings/model.js';

defineElement();
