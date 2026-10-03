/*
 * The frontend's own CSS: the layouts that have no web component (flex
 * boxes, the form grid, the 12-column grid), the UI5 spacing helper classes
 * views use (sapUiSmallMargin & co., portable profile v1 section 2), the
 * composed controls (ObjectStatus, ObjectNumber) and the frontend chrome
 * (busy overlay, error, diagnostics, unsupported box). Theme values come
 * from the web components' CSS variables, so a theme switch restyles it.
 */
const SIZES = { Tiny: '0.5rem', Small: '1rem', Medium: '2rem', Large: '3rem' };

function spacing() {
  const out = [];
  for (const [n, v] of Object.entries(SIZES)) {
    out.push(`.sapUi${n}Margin{margin:${v}}`);
    out.push(`.sapUi${n}MarginTop{margin-top:${v}}`, `.sapUi${n}MarginBottom{margin-bottom:${v}}`);
    out.push(`.sapUi${n}MarginBegin{margin-inline-start:${v}}`, `.sapUi${n}MarginEnd{margin-inline-end:${v}}`);
    out.push(`.sapUi${n}MarginBeginEnd{margin-inline:${v}}`, `.sapUi${n}MarginTopBottom{margin-block:${v}}`);
    out.push(`.sapUiForceWidthAuto.sapUi${n}Margin{width:auto}`);
  }
  out.push('.sapUiNoMargin{margin:0}', '.sapUiNoMarginTop{margin-top:0}', '.sapUiNoMarginBottom{margin-bottom:0}', '.sapUiNoMarginBegin{margin-inline-start:0}', '.sapUiNoMarginEnd{margin-inline-end:0}');
  out.push('.sapUiResponsiveMargin{margin:1rem}', '.sapUiContentPadding{padding:1rem}', '.sapUiNoContentPadding{padding:0}', '.sapUiResponsiveContentPadding{padding:1rem}');
  out.push('.sapUiTinyMarginTopBottom{margin-block:0.5rem}', '.sapThemeHighlight-asColor{color:var(--sapHighlightColor)}');
  out.push('.sapMFlexItemAlignCenter{align-self:center}', '.sapUiHidden{display:none}');
  return out.join('\n');
}

function grid() {
  const out = ['.a2u-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:1rem;row-gap:1rem}'];
  out.push('.a2u-grid>.a2u-grid-cell{grid-column:span var(--a2u-span-s,12)}');
  out.push('@media (min-width:600px){.a2u-grid>.a2u-grid-cell{grid-column:span var(--a2u-span-m,6)}}');
  out.push('@media (min-width:1024px){.a2u-grid>.a2u-grid-cell{grid-column:span var(--a2u-span-l,3)}}');
  out.push('@media (min-width:1440px){.a2u-grid>.a2u-grid-cell{grid-column:span var(--a2u-span-xl,3)}}');
  return out.join('\n');
}

export const CSS = `
:host{display:block;position:relative;height:100%;font-family:var(--sapFontFamily);color:var(--sapTextColor);background:var(--sapBackgroundColor)}
.a2u-root{position:relative;height:100%;display:flex;flex-direction:column}
.a2u-main{flex:1 1 auto;min-height:0;position:relative}
.a2u-main>*,.a2u-view,.a2u-shell,.a2u-app,.a2u-navcontainer{height:100%}
.a2u-shell{max-width:1280px;margin:0 auto;box-shadow:0 0 0.5rem rgba(0,0,0,0.08)}
.a2u-page{height:100%}
.a2u-page-content{min-height:100%}
.a2u-page-header ui5-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a2u-flexbox{box-sizing:border-box}
.a2u-flexbox>*{flex:0 1 auto}
.a2u-bg-solid{background:var(--sapGroup_ContentBackground)}
.a2u-vlayout{display:flex;flex-direction:column;align-items:flex-start}
.a2u-hlayout{display:inline-flex;flex-wrap:wrap;align-items:center}
.a2u-scroll{box-sizing:border-box}
${grid()}
.a2u-form{box-sizing:border-box;padding:0.5rem 1rem}
.a2u-form-header{padding:0.5rem 0;border-bottom:1px solid var(--sapGroup_TitleBorderColor);margin-bottom:0.5rem}
.a2u-form-grid{display:grid;grid-template-columns:minmax(6rem,33%) 1fr;column-gap:1rem;row-gap:0.5rem;align-items:center}
.a2u-form-grid>.a2u-form-group-title{grid-column:1/-1;margin-top:0.75rem}
.a2u-form-grid>.a2u-form-container{grid-column:1/-1;display:grid;grid-template-columns:minmax(6rem,33%) 1fr;column-gap:1rem;row-gap:0.5rem;align-items:center}
.a2u-form-container>.a2u-form-group-title{grid-column:1/-1}
.a2u-form-element{display:contents}
.a2u-form-label{justify-self:end;text-align:end}
.a2u-form-fields{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;min-width:0}
.a2u-form-fields>ui5-input,.a2u-form-fields>ui5-textarea,.a2u-form-fields>ui5-select,.a2u-form-fields>ui5-combobox,.a2u-form-fields>ui5-multi-combobox,.a2u-form-fields>ui5-date-picker,.a2u-form-fields>ui5-time-picker,.a2u-form-fields>ui5-datetime-picker,.a2u-form-fields>ui5-step-input,.a2u-form-fields>ui5-multi-input{flex:1 1 10rem;min-width:6rem}
@media (max-width:600px){.a2u-form-grid,.a2u-form-grid>.a2u-form-container{grid-template-columns:1fr}.a2u-form-label{justify-self:start;text-align:start}}
.a2u-toolbar-spacer{flex:1}
.a2u-toolbar-clear{--_ui5_toolbar_background:transparent}
.a2u-table{display:flex;flex-direction:column;box-sizing:border-box}
.a2u-table-header-text{padding:0.5rem 1rem}
.a2u-nodata{padding:1rem;text-align:center;color:var(--sapContent_LabelColor)}
ui5-table-row[data-highlight=Negative]{box-shadow:inset 0.25rem 0 var(--sapNegativeColor)}
ui5-table-row[data-highlight=Critical]{box-shadow:inset 0.25rem 0 var(--sapCriticalColor)}
ui5-table-row[data-highlight=Positive]{box-shadow:inset 0.25rem 0 var(--sapPositiveColor)}
ui5-table-row[data-highlight=Information]{box-shadow:inset 0.25rem 0 var(--sapInformativeColor)}
.a2u-status{display:inline-flex;align-items:center;gap:0.25rem;font-size:var(--sapFontSize)}
.a2u-status-icon{width:1rem;height:1rem;color:inherit}
.a2u-status-title{color:var(--sapContent_LabelColor)}
.a2u-status-inverted{padding:0 0.375rem;border-radius:0.25rem;border:1px solid currentColor}
.a2u-number{white-space:nowrap}
.a2u-number-emphasized .a2u-number-value{font-weight:bold}
.a2u-number-unit{font-size:var(--sapFontSmallSize)}
.a2u-state-Positive{color:var(--sapPositiveTextColor,var(--sapPositiveColor))}
.a2u-state-Negative{color:var(--sapNegativeTextColor,var(--sapNegativeColor))}
.a2u-state-Critical{color:var(--sapCriticalTextColor,var(--sapCriticalColor))}
.a2u-state-Information{color:var(--sapInformativeTextColor,var(--sapInformativeColor))}
.a2u-identifier-title{font-weight:bold}
.a2u-identifier-text{color:var(--sapContent_LabelColor);font-size:var(--sapFontSmallSize)}
.a2u-attribute-title{color:var(--sapContent_LabelColor)}
.a2u-object-header{padding:1rem;display:flex;flex-direction:column;gap:0.5rem}
.a2u-object-header-head{display:flex;justify-content:space-between;align-items:baseline;gap:1rem}
.a2u-image{max-width:100%}
.a2u-radiogroup{display:grid}
.a2u-icontabbar ui5-tabcontainer{min-height:2.75rem}
.a2u-panel{box-sizing:border-box}
.a2u-dialog-content,.a2u-popover-content{box-sizing:border-box;max-width:100%}
.a2u-dialog-header{display:flex;align-items:center;gap:0.5rem;padding:0 1rem;height:2.75rem}
.a2u-unread{font-weight:bold}
.a2u-unsupported{border:1px dashed var(--sapCriticalBorderColor,#e76500);background:var(--sapWarningBackground,#fff8d6);color:var(--sapCriticalTextColor,#b44f00);padding:0.5rem;margin:0.25rem;font-size:var(--sapFontSmallSize);border-radius:0.25rem}
.a2u-unsupported-content{margin-top:0.5rem;color:var(--sapTextColor)}
.a2u-busy{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(255,255,255,0.35);z-index:50}
.a2u-root[data-busy=shown] .a2u-busy{display:flex}
.a2u-error-status{font-size:var(--sapFontSmallSize);color:var(--sapContent_LabelColor);margin-bottom:0.5rem}
.a2u-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.a2u-error-text{white-space:pre-wrap;font-family:var(--sapFontFamily);max-height:50vh;overflow:auto;margin:0}
.a2u-box-text{white-space:pre-wrap;max-width:40rem;display:block}
.a2u-box-details{white-space:pre-wrap;margin-top:0.75rem;font-size:var(--sapFontSmallSize);max-height:40vh;overflow:auto;color:var(--sapContent_LabelColor)}
.a2u-diagnostics{position:absolute;right:0.5rem;bottom:0.5rem;z-index:40;max-width:min(32rem,90%);background:var(--sapGroup_ContentBackground);border:1px solid var(--sapGroup_ContentBorderColor);border-radius:0.5rem;box-shadow:var(--sapContent_Shadow1);font-size:var(--sapFontSmallSize)}
.a2u-diagnostics>summary{cursor:pointer;padding:0.25rem 0.75rem;color:var(--sapCriticalTextColor)}
.a2u-diagnostics ul{margin:0;padding:0.25rem 1.5rem 0.5rem;max-height:40vh;overflow:auto}
.a2u-diagnostics[hidden]{display:none}
.a2u-nested{display:contents}
${spacing()}
`;
