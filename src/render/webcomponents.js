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
import '@ui5/webcomponents/dist/TableGrowing.js';
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

export { TAGS } from './webcomponents-tags.js';
