if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,d)=>{const n=e||("document"in self?document.currentScript.src:"")||location.href;if(s[n])return;let o={};const c=e=>i(e,n),t={module:{uri:n},exports:o,require:c};s[n]=Promise.all(r.map((e=>t[e]||c(e)))).then((e=>(d(...e),o)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"4ff6379b97c9c6e20cc523a6b078a424"},{url:"icons.js",revision:"9c1f23b5d642cd031f6d4710de9588d8"},{url:"oscd-designer.js",revision:"a5dedad8a7d12f8df31d6143f1c16441"},{url:"oscd-designer.spec.js",revision:"ee5fa86c1e0826d9340c1245273b83c1"},{url:"sld-editor.js",revision:"a3ea6f0daa7ba305180ce351cb85e99d"},{url:"util.js",revision:"ea739b976d9750c8e2a192619df4a1b9"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
