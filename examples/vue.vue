<!-- Vue 3: tell the compiler the tag is a custom element
     (vite.config: vue({ template: { compilerOptions: { isCustomElement: (t) => t === 'abap2ui5-app' } } })) -->
<script setup>
import '@abap2ui5/frontend-webcomponent';
defineProps({ app: String });
</script>

<template>
  <abap2ui5-app
    endpoint="/sap/bc/z2ui5/"
    :app="app"
    style="display: block; height: 600px"
    @abap2ui5-message="(e) => console.log('message', e.detail)"
  />
</template>
