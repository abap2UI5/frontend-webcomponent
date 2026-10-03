/*
 * The web components this frontend renders - and only those, so the bundle
 * carries no component it never creates. Keep in sync with the mappers
 * (test/unit/registry.test.mjs checks every tag a mapper uses is imported).
 *
 * Icons and the non-default themes load on demand (dynamic imports the
 * bundler splits into chunks next to the bundle).
 */
import '@ui5/webcomponents/dist/Avatar.js';
import '@ui5/webcomponents/dist/Bar.js';
import '@ui5/webcomponents/dist/BusyIndicator.js';
import '@ui5/webcomponents/dist/Button.js';
import '@ui5/webcomponents/dist/CheckBox.js';
import '@ui5/webcomponents/dist/ComboBox.js';
import '@ui5/webcomponents/dist/ComboBoxItem.js';
import '@ui5/webcomponents/dist/DatePicker.js';
import '@ui5/webcomponents/dist/DateRangePicker.js';
import '@ui5/webcomponents/dist/DateTimePicker.js';
import '@ui5/webcomponents/dist/Dialog.js';
import '@ui5/webcomponents/dist/Icon.js';
import '@ui5/webcomponents/dist/Input.js';
import '@ui5/webcomponents/dist/SuggestionItem.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/Link.js';
import '@ui5/webcomponents/dist/List.js';
import '@ui5/webcomponents/dist/ListItemStandard.js';
import '@ui5/webcomponents/dist/ListItemCustom.js';
import '@ui5/webcomponents/dist/MessageStrip.js';
import '@ui5/webcomponents/dist/MultiComboBox.js';
import '@ui5/webcomponents/dist/MultiComboBoxItem.js';
import '@ui5/webcomponents/dist/MultiInput.js';
import '@ui5/webcomponents/dist/Token.js';
import '@ui5/webcomponents/dist/Option.js';
import '@ui5/webcomponents/dist/Panel.js';
import '@ui5/webcomponents/dist/Popover.js';
import '@ui5/webcomponents/dist/ProgressIndicator.js';
import '@ui5/webcomponents/dist/RadioButton.js';
import '@ui5/webcomponents/dist/RatingIndicator.js';
import '@ui5/webcomponents/dist/SegmentedButton.js';
import '@ui5/webcomponents/dist/SegmentedButtonItem.js';
import '@ui5/webcomponents/dist/Select.js';
import '@ui5/webcomponents/dist/Slider.js';
import '@ui5/webcomponents/dist/StepInput.js';
import '@ui5/webcomponents/dist/Switch.js';
import '@ui5/webcomponents/dist/Tab.js';
import '@ui5/webcomponents/dist/TabContainer.js';
import '@ui5/webcomponents/dist/TabSeparator.js';
import '@ui5/webcomponents/dist/Table.js';
import '@ui5/webcomponents/dist/TableCell.js';
import '@ui5/webcomponents/dist/TableHeaderCell.js';
import '@ui5/webcomponents/dist/TableHeaderRow.js';
import '@ui5/webcomponents/dist/TableRow.js';
import '@ui5/webcomponents/dist/TableSelectionMulti.js';
import '@ui5/webcomponents/dist/TableSelectionSingle.js';
import '@ui5/webcomponents/dist/Tag.js';
import '@ui5/webcomponents/dist/Text.js';
import '@ui5/webcomponents/dist/TextArea.js';
import '@ui5/webcomponents/dist/TimePicker.js';
import '@ui5/webcomponents/dist/Title.js';
import '@ui5/webcomponents/dist/Toast.js';
import '@ui5/webcomponents/dist/ToggleButton.js';
import '@ui5/webcomponents/dist/Toolbar.js';
import '@ui5/webcomponents/dist/ToolbarButton.js';
import '@ui5/webcomponents/dist/ToolbarItem.js';
import '@ui5/webcomponents/dist/ToolbarSeparator.js';
import '@ui5/webcomponents/dist/ToolbarSpacer.js';
import '@ui5/webcomponents/dist/Tree.js';
import '@ui5/webcomponents/dist/TreeItem.js';
import '@ui5/webcomponents-fiori/dist/Page.js';

// on demand: icons by name, CLDR locale data, themes other than the built-in sap_horizon
import '@ui5/webcomponents-localization/dist/Assets.js';
import '@ui5/webcomponents-icons/dist/AllIcons.js';
import '@ui5/webcomponents/dist/generated/json-imports/Themes.js';
import '@ui5/webcomponents-fiori/dist/generated/json-imports/Themes.js';

/** The tags imported above (the registry test compares the mappers against it). */
export const TAGS = [
  'ui5-avatar', 'ui5-bar', 'ui5-busy-indicator', 'ui5-button', 'ui5-checkbox', 'ui5-combobox', 'ui5-cb-item',
  'ui5-date-picker', 'ui5-daterange-picker', 'ui5-datetime-picker', 'ui5-dialog', 'ui5-icon', 'ui5-input',
  'ui5-suggestion-item', 'ui5-label', 'ui5-link', 'ui5-list', 'ui5-li', 'ui5-li-custom', 'ui5-message-strip',
  'ui5-multi-combobox', 'ui5-mcb-item', 'ui5-multi-input', 'ui5-token', 'ui5-option', 'ui5-panel', 'ui5-popover',
  'ui5-progress-indicator', 'ui5-radio-button', 'ui5-rating-indicator', 'ui5-segmented-button',
  'ui5-segmented-button-item', 'ui5-select', 'ui5-slider', 'ui5-step-input', 'ui5-switch', 'ui5-tab',
  'ui5-tabcontainer', 'ui5-tab-separator', 'ui5-table', 'ui5-table-cell', 'ui5-table-header-cell',
  'ui5-table-header-row', 'ui5-table-row', 'ui5-table-selection-multi', 'ui5-table-selection-single', 'ui5-tag',
  'ui5-text', 'ui5-textarea', 'ui5-time-picker', 'ui5-title', 'ui5-toast', 'ui5-toggle-button', 'ui5-toolbar',
  'ui5-toolbar-button', 'ui5-toolbar-item', 'ui5-toolbar-separator', 'ui5-toolbar-spacer', 'ui5-tree', 'ui5-tree-item', 'ui5-page',
];
