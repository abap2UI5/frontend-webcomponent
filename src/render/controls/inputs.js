/*
 * Input controls: every two-way binding of the portable profile lives here.
 *
 * A two-way property writes the control's value into the model (and the
 * edited-paths set the next roundtrip ships) on the web component's commit
 * event - `change` for text fields, as UI5 writes on change - and silently
 * on every keystroke (`live`), so a click straight after typing carries the
 * value. The event wires fire after the write.
 */
import { define } from '../registry.js';
import { formatDatePattern } from '../../bindings/types.js';
import {
  enabled, editable, valueState, valueStateText, text, iconName, VALUE_STATE,
} from './common.js';

const INPUT_TYPE = { Text: 'Text', Email: 'Email', Number: 'Number', Password: 'Password', Tel: 'Tel', Url: 'URL' };
const str = (v) => (v === undefined || v === null ? '' : String(v));

function suggestions(el, node, api) {
  const groups = api.renderer.groups(node, { defaultAggregation: 'suggestionItems' });
  if (!groups.has('suggestionItems') && node.attrs.suggestionItems === undefined) return;
  el.setAttribute('show-suggestions', '');
  api.aggregation(node, 'suggestionItems', (kids) => kids.forEach((k) => el.appendChild(k)), { groups, c: { ...api.ctx, itemKind: 'suggestion' } });
}

define('sap.m.Input', {
  render(node, api) {
    const el = api.el('ui5-input');
    api.renderer.applyAttributes(el, this, node, api);
    if (api.toBool(api.evaluate(node.attrs.showValueHelp ?? 'false'))) {
      const ic = api.el('ui5-icon', { slot: 'icon', name: node.attrs.valueHelpIconSrc ? iconName(api.evaluate(node.attrs.valueHelpIconSrc)) : 'value-help', mode: 'Interactive' });
      el.appendChild(ic);
      if (node.attrs.valueHelpRequest) api.wire(ic, 'valueHelpRequest', { on: 'click', params: () => ({ fromSuggestions: false }) });
    }
    suggestions(el, node, api);
    return el;
  },
  props: {
    value: { prop: 'value', convert: str, twoWay: { event: 'change', live: 'input', read: (el) => el.value } },
    placeholder: { attr: 'placeholder' },
    enabled,
    editable,
    type: { attr: 'type', map: INPUT_TYPE },
    valueState,
    valueStateText,
    maxLength: { attr: 'maxlength', convert: (v) => (Number(v) > 0 ? v : '') },
    required: { attr: 'required', bool: true },
    width: { style: 'width' },
    textAlign: { set: (el, v) => { el.style.textAlign = v || ''; } },
    description: 'ignore',
    fieldWidth: 'ignore',
    showValueHelp: 'ignore',
    valueHelpOnly: { set: (el, v, api) => { if (api.toBool(v)) el.setAttribute('readonly', ''); } },
    valueHelpIconSrc: 'ignore',
    showSuggestion: 'ignore',
    showClearIcon: { attr: 'show-clear-icon', bool: true },
    valueLiveUpdate: 'ignore',
    autocomplete: 'ignore',
    name: { attr: 'name' },
    submitOnEnter: 'ignore',
  },
  events: {
    change: { on: 'change', params: (ev, el) => ({ value: el.value }) },
    liveChange: { on: 'input', params: (ev, el) => ({ value: el.value, newValue: el.value }) },
    submit: { on: 'keydown', filter: (ev) => ev.key === 'Enter', params: (ev, el) => ({ value: el.value }) },
    suggestionItemSelected: { on: 'selection-change', params: (ev) => ({ selectedItem: ev.detail && ev.detail.item }) },
  },
  aggregations: { suggestionItems: 'ignore' },
  read: { value: (el) => el.value, enabled: (el) => !el.disabled, placeholder: (el) => el.placeholder || '' },
});

define('sap.m.MaskInput', {
  tag: 'ui5-input',
  props: {
    value: { prop: 'value', convert: str, twoWay: { event: 'change', live: 'input', read: (el) => el.value } },
    placeholder: { attr: 'placeholder' },
    enabled,
    editable,
    valueState,
    mask: { attr: 'placeholder' },
    placeholderSymbol: 'ignore',
  },
  events: { change: { on: 'change', params: (ev, el) => ({ value: el.value }) }, liveChange: { on: 'input', params: (ev, el) => ({ value: el.value }) } },
  aggregations: { rules: 'ignore' },
  read: { value: (el) => el.value },
  status: 'basic',
  note: 'a plain input: the mask is shown as placeholder, not enforced',
});

define('sap.m.SearchField', {
  render(node, api) {
    const el = api.el('ui5-input', { type: 'Search', 'show-clear-icon': true, class: 'a2u-searchfield' });
    const ic = api.el('ui5-icon', { slot: 'icon', name: 'search', mode: 'Interactive' });
    el.appendChild(ic);
    api.renderer.applyAttributes(el, this, node, api, { skip: ['search'] });
    if (node.attrs.search) {
      const params = () => ({ query: el.value, clearButtonPressed: false, refreshButtonPressed: false });
      api.wire(el, 'search', { on: 'keydown', filter: (ev) => ev.key === 'Enter', params });
      api.wire(ic, 'search', { on: 'click', params, target: () => ic }, api.ctx, node);
    }
    return el;
  },
  props: {
    value: { prop: 'value', convert: str, twoWay: { event: 'change', live: 'input', read: (el) => el.value } },
    placeholder: { attr: 'placeholder', default: 'Search' },
    enabled,
    width: { style: 'width' },
    showSearchButton: 'ignore',
    showRefreshButton: 'ignore',
    maxLength: { attr: 'maxlength' },
  },
  events: {
    liveChange: { on: 'input', params: (ev, el) => ({ newValue: el.value }) },
    change: { on: 'change', params: (ev, el) => ({ value: el.value }) },
  },
  read: { value: (el) => el.value },
});

define('sap.m.TextArea', {
  tag: 'ui5-textarea',
  props: {
    value: { prop: 'value', convert: str, twoWay: { event: 'change', live: 'input', read: (el) => el.value } },
    placeholder: { attr: 'placeholder' },
    rows: { attr: 'rows' },
    growing: { attr: 'growing', bool: true },
    growingMaxLines: { attr: 'growing-max-rows' },
    maxLength: { attr: 'maxlength', convert: (v) => (Number(v) > 0 ? v : '') },
    showExceededText: { attr: 'show-exceeded-text', bool: true },
    enabled,
    editable,
    valueState,
    valueStateText,
    width: { style: 'width' },
    height: { style: 'height' },
    cols: 'ignore',
    wrapping: 'ignore',
    required: { attr: 'required', bool: true },
  },
  events: {
    change: { on: 'change', params: (ev, el) => ({ value: el.value }) },
    liveChange: { on: 'input', params: (ev, el) => ({ value: el.value, newValue: el.value }) },
  },
  read: { value: (el) => el.value },
});

define('sap.m.CheckBox', {
  tag: 'ui5-checkbox',
  props: {
    selected: { prop: 'checked', bool: true, twoWay: { event: 'change', read: (el) => el.checked } },
    text: { attr: 'text' },
    enabled,
    editable,
    valueState,
    wrapping: { set: (el, v, api) => el.setAttribute('wrapping-type', api.toBool(v) ? 'Normal' : 'None') },
    partiallySelected: { attr: 'indeterminate', bool: true },
    displayOnly: { attr: 'display-only', bool: true },
    required: { attr: 'required', bool: true },
    name: { attr: 'name' },
    textAlign: 'ignore',
    width: { style: 'width' },
    useEntireWidth: 'ignore',
  },
  events: { select: { on: 'change', params: (ev, el) => ({ selected: el.checked }) } },
  read: { selected: (el) => el.checked, text: (el) => el.getAttribute('text') || '' },
});

define('sap.m.Switch', {
  tag: 'ui5-switch',
  props: {
    state: { prop: 'checked', bool: true, twoWay: { event: 'change', read: (el) => el.checked } },
    customTextOn: { attr: 'text-on' },
    customTextOff: { attr: 'text-off' },
    enabled,
    type: { set: (el, v) => { if (v === 'AcceptReject') el.setAttribute('design', 'Graphical'); } },
    name: { attr: 'name' },
  },
  events: { change: { on: 'change', params: (ev, el) => ({ state: el.checked }) } },
  read: { state: (el) => el.checked },
});

/*
 * Select / ComboBox / MultiComboBox share the items: core:Item and
 * core:ListItem render as the option element the parent needs
 * (ctx.itemKind), the key kept in data-key.
 */
function itemRender(node, api, ctx) {
  const kind = ctx.itemKind;
  const tag = { option: 'ui5-option', cb: 'ui5-cb-item', mcb: 'ui5-mcb-item', suggestion: 'ui5-suggestion-item', tab: 'ui5-tab' }[kind] || 'ui5-option';
  const el = api.el(tag);
  const a = node.attrs;
  api.bind(a.key ?? '', (v) => {
    el.dataset.key = v ?? '';
    if (kind === 'option') el.setAttribute('value', v ?? '');
    if (kind === 'cb') el.setAttribute('value', v ?? '');
    if (el.__a2uSync) el.__a2uSync();
  });
  api.bind(a.text ?? '', (v) => {
    if (kind === 'option') el.textContent = v ?? '';
    else el.setAttribute('text', v ?? '');
  });
  if (a.icon !== undefined) api.bind(a.icon, (v) => (v ? el.setAttribute('icon', iconName(v)) : el.removeAttribute('icon')));
  if (a.additionalText !== undefined) api.bind(a.additionalText, (v) => (v ? el.setAttribute('additional-text', v) : el.removeAttribute('additional-text')));
  if (a.enabled !== undefined) api.bind(a.enabled, (v) => el.toggleAttribute('disabled', !api.toBool(v)));
  return el;
}

define('sap.ui.core.Item', { render: itemRender, read: { key: (el) => el.dataset.key, text: (el) => el.getAttribute('text') ?? el.textContent } });
define('sap.ui.core.ListItem', { render: itemRender, read: { key: (el) => el.dataset.key, text: (el) => el.getAttribute('text') ?? el.textContent } });
define('sap.ui.core.SeparatorItem', { render: (node, api) => api.el('ui5-option', { disabled: true, text: '────────' }), status: 'basic' });
define('sap.m.SuggestionItem', { render: (node, api, ctx) => itemRender(node, api, { ...ctx, itemKind: 'suggestion' }), status: 'basic' });

function choiceItems(el, node, api, kind, after) {
  const groups = api.renderer.groups(node, { defaultAggregation: 'items' });
  api.aggregation(node, 'items', (kids) => {
    kids.forEach((k) => el.appendChild(k));
    after();
  }, { groups, c: { ...api.ctx, itemKind: kind } });
}

define('sap.m.Select', {
  render(node, api) {
    const el = api.el('ui5-select');
    let key;
    const sync = () => {
      const opts = [...el.children].filter((o) => o.tagName === 'UI5-OPTION');
      let hit = opts.find((o) => o.dataset.key === str(key));
      if (!hit && opts.length && (key === undefined || key === '' || key === null) && node.attrs.forceSelection !== 'false') hit = opts[0];
      for (const o of opts) o.selected = o === hit;
    };
    el.__a2uSync = sync;
    choiceItems(el, node, api, 'option', sync);
    api.prop(el, 'selectedKey', {
      set: (e, v) => { key = v; sync(); },
      twoWay: { event: 'change', read: (e) => (e.selectedOption ? e.selectedOption.dataset.key : '') },
    });
    api.renderer.applyAttributes(el, this, node, api, { skip: ['selectedKey'] });
    return el;
  },
  props: {
    selectedKey: 'ignore',
    enabled,
    editable,
    valueState,
    valueStateText,
    width: { style: 'width' },
    required: { attr: 'required', bool: true },
    forceSelection: 'ignore',
    showSecondaryValues: 'ignore',
    autoAdjustWidth: 'ignore',
    selectedItemId: 'ignore',
    name: { attr: 'name' },
    icon: { attr: 'icon', convert: iconName },
    type: 'ignore',
  },
  events: {
    change: { on: 'change', params: (ev) => ({ selectedItem: ev.detail && ev.detail.selectedOption }) },
  },
  aggregations: { items: 'ignore' },
  read: {
    selectedKey: (el) => (el.selectedOption ? el.selectedOption.dataset.key : ''),
    selectedItem: (el) => el.selectedOption || null,
  },
});

define('sap.m.ComboBox', {
  render(node, api) {
    const el = api.el('ui5-combobox');
    let key;
    const sync = () => {
      const items = [...el.children].filter((o) => o.tagName === 'UI5-CB-ITEM');
      const hit = items.find((o) => o.dataset.key === str(key));
      if (hit) el.value = hit.getAttribute('text') || '';
      else if (key === '' || key === undefined) el.value = node.attrs.value !== undefined ? str(api.evaluate(node.attrs.value)) : '';
    };
    el.__a2uSync = sync;
    choiceItems(el, node, api, 'cb', sync);
    const selected = () => {
      const items = [...el.children].filter((o) => o.tagName === 'UI5-CB-ITEM');
      const hit = items.find((o) => (o.getAttribute('text') || '') === el.value);
      return hit ? hit.dataset.key : '';
    };
    el.__a2uSelectedKey = selected;
    api.prop(el, 'selectedKey', { set: (e, v) => { key = v; sync(); }, twoWay: { event: ['selection-change', 'change'], read: selected } });
    api.renderer.applyAttributes(el, this, node, api, { skip: ['selectedKey'] });
    return el;
  },
  props: {
    selectedKey: 'ignore',
    value: { prop: 'value', convert: str, twoWay: { event: 'change', read: (el) => el.value } },
    placeholder: { attr: 'placeholder' },
    enabled,
    editable,
    valueState,
    valueStateText,
    width: { style: 'width' },
    required: { attr: 'required', bool: true },
    showSecondaryValues: 'ignore',
    filterSecondaryValues: 'ignore',
    showClearIcon: { attr: 'show-clear-icon', bool: true },
  },
  events: {
    change: { on: 'change', params: (ev, el) => ({ value: el.value }) },
    selectionChange: { on: 'selection-change', params: (ev) => ({ selectedItem: ev.detail && ev.detail.item }) },
  },
  aggregations: { items: 'ignore' },
  read: { selectedKey: (el) => (el.__a2uSelectedKey ? el.__a2uSelectedKey() : ''), value: (el) => el.value },
});

define('sap.m.MultiComboBox', {
  render(node, api) {
    const el = api.el('ui5-multi-combobox');
    let keys = [];
    const items = () => [...el.children].filter((o) => o.tagName === 'UI5-MCB-ITEM');
    const sync = () => { for (const o of items()) o.selected = keys.includes(o.dataset.key); };
    el.__a2uSync = sync;
    choiceItems(el, node, api, 'mcb', sync);
    api.prop(el, 'selectedKeys', {
      set: (e, v) => { keys = Array.isArray(v) ? v.map(str) : (v ? String(v).split(',') : []); sync(); },
      twoWay: { event: 'selection-change', read: () => items().filter((o) => o.selected).map((o) => o.dataset.key) },
    });
    api.renderer.applyAttributes(el, this, node, api, { skip: ['selectedKeys'] });
    return el;
  },
  props: {
    selectedKeys: 'ignore',
    placeholder: { attr: 'placeholder' },
    enabled,
    editable,
    valueState,
    valueStateText,
    width: { style: 'width' },
    showSelectAll: { attr: 'show-select-all', bool: true },
    showClearIcon: { attr: 'show-clear-icon', bool: true },
  },
  events: {
    selectionChange: { on: 'selection-change', params: (ev) => ({ changedItem: ev.detail && ev.detail.items && ev.detail.items[0], selected: true }) },
    selectionFinish: { on: 'close', params: (ev, el) => ({ selectedItems: [...el.children].filter((o) => o.selected) }) },
  },
  aggregations: { items: 'ignore' },
  read: { selectedKeys: (el) => [...el.children].filter((o) => o.selected).map((o) => o.dataset.key) },
});

/*
 * `dateValue`, `minDate`, `maxDate`: JS Dates in UI5 - from one of the
 * profile's frontend formatters (Formatter.DateAbapDateToDateObject, ...),
 * as the JSON model has no Date. Written as strings in the picker's
 * valueFormat (`fallback` when the view sets none; `dateValue` then sets
 * that format on the picker). One-way, as a formatter binding is in UI5.
 */
const asDate = (v) => {
  const d = v instanceof Date ? v : (v ? new Date(v) : null);
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const valueFormatOf = (api) => {
  const raw = api.node.attrs.valueFormat;
  return raw !== undefined ? api.evaluate(raw) : '';
};
const dateValue = (fallback) => ({
  set(el, v, api) {
    const d = asDate(v);
    if (!d) {
      el.value = '';
      return;
    }
    let pattern = valueFormatOf(api);
    if (!pattern) {
      pattern = fallback;
      el.setAttribute('value-format', pattern);
    }
    el.value = formatDatePattern(d, pattern);
  },
});
const dateLimit = (attr, fallback) => ({
  set(el, v, api) {
    if (v === undefined || v === null || v === '') return el.removeAttribute(attr);
    const d = v instanceof Date ? asDate(v) : null;
    if (v instanceof Date && !d) return el.removeAttribute(attr);
    return el.setAttribute(attr, d ? formatDatePattern(d, valueFormatOf(api) || fallback) : String(v));
  },
});

const dateProps = {
  value: { prop: 'value', convert: str, twoWay: { event: 'change', read: (el) => el.value } },
  valueFormat: { attr: 'value-format' },
  displayFormat: { attr: 'display-format' },
  placeholder: { attr: 'placeholder' },
  enabled,
  editable,
  valueState,
  valueStateText,
  width: { style: 'width' },
  required: { attr: 'required', bool: true },
  minDate: dateLimit('min-date', 'yyyy-MM-dd'),
  maxDate: dateLimit('max-date', 'yyyy-MM-dd'),
  dateValue: dateValue('yyyy-MM-dd'),
  showFooter: 'ignore',
  name: { attr: 'name' },
  hideInput: 'ignore',
  showCurrentDateButton: 'ignore',
  initialFocusedDateValue: 'ignore',
  displayFormatType: 'ignore',
  calendarWeekNumbering: { attr: 'calendar-week-numbering' },
};
const dateEvents = {
  change: { on: 'change', params: (ev, el) => ({ value: el.value, valid: ev.detail ? ev.detail.valid !== false : true }) },
  liveChange: { on: 'input', params: (ev, el) => ({ value: el.value }) },
};
define('sap.m.DatePicker', { tag: 'ui5-date-picker', props: dateProps, events: dateEvents, read: { value: (el) => el.value }, status: 'basic', note: 'value (two-way), valueFormat, displayFormat, minDate/maxDate; dateValue one-way (from a frontend formatter)' });
define('sap.m.DateRangeSelection', {
  tag: 'ui5-daterange-picker',
  props: { ...dateProps, dateValue: 'ignore', delimiter: { attr: 'delimiter' } },
  events: dateEvents,
  read: { value: (el) => el.value },
  status: 'basic',
  note: 'value only (no dateValue/secondDateValue)',
});
define('sap.m.TimePicker', {
  tag: 'ui5-time-picker',
  props: { ...dateProps, minDate: 'ignore', maxDate: 'ignore', dateValue: dateValue('HH:mm:ss') },
  events: dateEvents,
  read: { value: (el) => el.value },
  status: 'basic',
});
define('sap.m.DateTimePicker', {
  tag: 'ui5-datetime-picker',
  props: {
    ...dateProps,
    dateValue: dateValue('yyyy-MM-dd HH:mm:ss'),
    minDate: dateLimit('min-date', 'yyyy-MM-dd HH:mm:ss'),
    maxDate: dateLimit('max-date', 'yyyy-MM-dd HH:mm:ss'),
  },
  events: dateEvents,
  read: { value: (el) => el.value },
  status: 'basic',
  note: 'value (two-way), valueFormat, displayFormat, minDate/maxDate; dateValue one-way (from a frontend formatter)',
});

define('sap.m.StepInput', {
  tag: 'ui5-step-input',
  props: {
    value: { prop: 'value', number: true, twoWay: { event: 'change', read: (el) => Number(el.value) } },
    min: { attr: 'min' },
    max: { attr: 'max' },
    step: { attr: 'step' },
    displayValuePrecision: { attr: 'value-precision' },
    enabled,
    editable,
    valueState,
    valueStateText,
    width: { style: 'width' },
    required: { attr: 'required', bool: true },
    textAlign: 'ignore',
    largerStep: 'ignore',
    stepMode: 'ignore',
    description: 'ignore',
    fieldWidth: 'ignore',
    name: { attr: 'name' },
  },
  events: { change: { on: 'change', params: (ev, el) => ({ value: Number(el.value) }) } },
  read: { value: (el) => Number(el.value) },
});

define('sap.m.Slider', {
  tag: 'ui5-slider',
  props: {
    value: { prop: 'value', number: true, twoWay: { event: 'change', read: (el) => Number(el.value) } },
    min: { attr: 'min' },
    max: { attr: 'max' },
    step: { attr: 'step' },
    enabled,
    showAdvancedTooltip: { attr: 'show-tooltip', bool: true },
    enableTickmarks: { attr: 'show-tickmarks', bool: true },
    width: { style: 'width' },
    showHandleTooltip: 'ignore',
    inputsAsTooltips: { attr: 'editable-tooltip', bool: true },
  },
  events: {
    change: { on: 'change', params: (ev, el) => ({ value: Number(el.value) }) },
    liveChange: { on: 'input', params: (ev, el) => ({ value: Number(el.value) }) },
  },
  read: { value: (el) => Number(el.value) },
});

define('sap.m.RatingIndicator', {
  tag: 'ui5-rating-indicator',
  props: {
    value: { prop: 'value', number: true, twoWay: { event: 'change', read: (el) => Number(el.value) } },
    maxValue: { attr: 'max' },
    enabled,
    editable,
    displayOnly: { attr: 'readonly', bool: true },
    iconSize: { style: 'fontSize' },
  },
  events: { change: { on: 'change', params: (ev, el) => ({ value: Number(el.value) }) } },
  read: { value: (el) => Number(el.value) },
});

define('sap.m.RadioButton', {
  tag: 'ui5-radio-button',
  props: {
    selected: { prop: 'checked', bool: true, twoWay: { event: 'change', read: (el) => el.checked } },
    text: { attr: 'text' },
    groupName: { attr: 'name' },
    enabled,
    editable,
    valueState,
    wrapping: { set: (el, v, api) => el.setAttribute('wrapping-type', api.toBool(v) ? 'Normal' : 'None') },
    width: { style: 'width' },
    textDirection: 'ignore',
  },
  events: { select: { on: 'change', params: (ev, el) => ({ selected: el.checked }) } },
  read: { selected: (el) => el.checked, text: (el) => el.getAttribute('text') || '' },
});

let groupNo = 0;
define('sap.m.RadioButtonGroup', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-radiogroup', role: 'radiogroup' });
    const name = `a2u-rbg-${++groupNo}`;
    let index = 0;
    const buttons = () => [...el.querySelectorAll(':scope > ui5-radio-button')];
    const sync = () => buttons().forEach((b, i) => { b.checked = i === index; });
    const groups = api.renderer.groups(node, { defaultAggregation: 'buttons' });
    api.aggregation(node, 'buttons', (kids) => {
      for (const k of kids) {
        k.setAttribute('name', name);
        el.appendChild(k);
      }
      sync();
    }, { groups });
    api.prop(el, 'selectedIndex', {
      set: (e, v) => { index = Number(v ?? 0); sync(); },
      twoWay: { event: 'change', read: () => buttons().findIndex((b) => b.checked) },
    });
    api.bind(node.attrs.columns ?? '1', (v) => { el.style.gridTemplateColumns = `repeat(${Number(v) || 1}, auto)`; });
    if (node.attrs.enabled !== undefined) api.bind(node.attrs.enabled, (v) => buttons().forEach((b) => b.toggleAttribute('disabled', !api.toBool(v))));
    if (node.attrs.editable !== undefined) api.bind(node.attrs.editable, (v) => buttons().forEach((b) => b.toggleAttribute('readonly', !api.toBool(v))));
    if (node.attrs.valueState !== undefined) api.bind(node.attrs.valueState, (v) => buttons().forEach((b) => b.setAttribute('value-state', VALUE_STATE[v] || 'None')));
    if (node.attrs.select) api.wire(el, 'select', { on: 'change', params: () => ({ selectedIndex: buttons().findIndex((b) => b.checked) }) });
    return el;
  },
  read: { selectedIndex: (el) => [...el.querySelectorAll(':scope > ui5-radio-button')].findIndex((b) => b.checked) },
});

define('sap.m.SegmentedButton', {
  render(node, api) {
    const el = api.el('ui5-segmented-button');
    let key;
    const items = () => [...el.children].filter((o) => o.tagName === 'UI5-SEGMENTED-BUTTON-ITEM');
    const sync = () => {
      const all = items();
      const hit = all.find((o) => o.dataset.key === str(key)) || (key === undefined || key === '' ? all[0] : null);
      for (const o of all) o.selected = o === hit;
    };
    const groups = api.renderer.groups(node, { defaultAggregation: 'items' });
    api.aggregation(node, 'items', (kids) => {
      kids.forEach((k) => el.appendChild(k));
      sync();
    }, { groups });
    api.prop(el, 'selectedKey', {
      set: (e, v) => { key = v; sync(); },
      twoWay: { event: 'selection-change', read: () => { const s = items().find((o) => o.selected); return s ? s.dataset.key : ''; } },
    });
    if (node.attrs.enabled !== undefined) api.bind(node.attrs.enabled, (v) => el.toggleAttribute('disabled', !api.toBool(v)));
    if (node.attrs.width !== undefined) api.bind(node.attrs.width, (v) => { el.style.width = v || ''; });
    const ev = { on: 'selection-change', params: (e) => ({ item: e.detail && e.detail.selectedItems ? e.detail.selectedItems[0] : null }) };
    if (node.attrs.selectionChange) api.wire(el, 'selectionChange', ev);
    if (node.attrs.select) api.wire(el, 'select', ev);
    return el;
  },
  read: { selectedKey: (el) => { const s = [...el.children].find((o) => o.selected); return s ? s.dataset.key : ''; } },
});

define('sap.m.SegmentedButtonItem', {
  render(node, api) {
    const el = api.el('ui5-segmented-button-item');
    const a = node.attrs;
    api.bind(a.key ?? '', (v) => { el.dataset.key = v ?? ''; });
    api.bind(a.text ?? '', (v) => { el.textContent = v ?? ''; });
    if (a.icon !== undefined) api.bind(a.icon, (v) => (v ? el.setAttribute('icon', iconName(v)) : el.removeAttribute('icon')));
    if (a.enabled !== undefined) api.bind(a.enabled, (v) => el.toggleAttribute('disabled', !api.toBool(v)));
    if (a.tooltip !== undefined) api.bind(a.tooltip, (v) => (v ? el.setAttribute('tooltip', v) : el.removeAttribute('tooltip')));
    if (a.press) api.wire(el, 'press', { on: 'click', params: () => ({}) });
    return el;
  },
  read: { key: (el) => el.dataset.key, text: (el) => el.textContent },
});

export { text };
