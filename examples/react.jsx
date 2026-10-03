// React 19: custom elements are first-class - attributes pass through,
// and `on<event>` props subscribe to the element's custom events.
import '@abap2ui5/frontend-webcomponent'; // or <script type="module" src=".../abap2ui5-wc.js">

export default function Abap2UI5({ app }) {
  return (
    <abap2ui5-app
      endpoint="/sap/bc/z2ui5/"
      app={app}
      theme="sap_horizon"
      style={{ display: 'block', height: '600px' }}
      onabap2ui5-message={(e) => console.log('message', e.detail)}
    />
  );
}
// React 18 and older: add the listener with a ref -
//   const ref = useRef(); useEffect(() => { ref.current.addEventListener('abap2ui5-message', fn); }, []);
