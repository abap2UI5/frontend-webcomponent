/*
 * The control registry: UI5 control name -> mapper.
 *
 * A mapper describes how one UI5 control becomes a web component:
 *
 *   tag                 the element to create (generic rendering)
 *   props               { ui5Prop: spec }   spec: attr | prop | text | style | set,
 *                       bool / invert / map / number, twoWay { event, read, live }
 *   events              { ui5Event: { on, params(ev, el), filter, target } }
 *   aggregations        { name: { slot, wrap, into } | 'ignore' }
 *   defaultAggregation  the aggregation of children written without an
 *                       aggregation element (UI5's default aggregation)
 *   read                { ui5Prop: el => liveValue }  for `${$source>/prop}`
 *   render(node, api)   full control over the element (complex controls)
 *   status              'full' | 'basic' - for the coverage table
 *   note                what "basic" leaves out
 *
 * Custom controls register with define() before the first render - the
 * extension point for an app's own z2ui5.cc.* equivalents.
 */
const registry = new Map();

export function define(name, mapper) {
  registry.set(name, { status: 'full', ...mapper, name });
}

export function get(name) {
  return registry.get(name);
}

export function list() {
  return [...registry.values()];
}

export default { define, get, list };
