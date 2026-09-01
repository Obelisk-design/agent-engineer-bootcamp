/// <reference types="vite/client" />

// vue-tsc 原生解析 .vue；但普通 tsc / 编辑器 TS 服务（含 CI 诊断）不认 .vue 后缀 import，
// 补标准声明让 plain-TS 工具链也能解析 App.vue 等组件。
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
