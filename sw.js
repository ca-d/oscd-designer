if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,c)=>{const n=e||("document"in self?document.currentScript.src:"")||location.href;if(s[n])return;let o={};const d=e=>i(e,n),t={module:{uri:n},exports:o,require:d};s[n]=Promise.all(r.map((e=>t[e]||d(e)))).then((e=>(c(...e),o)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"0170f8f5d7714faaec95482634bcabdd"},{url:"icons.js",revision:"6135c466b9f9fc3f78963de9d348f70b"},{url:"oscd-designer.js",revision:"591cdf7a7c738ff28a635b3c557de87c"},{url:"oscd-designer.spec.js",revision:"e6460c3d88e78d62e9b46996fb58aa2a"},{url:"sld-editor.js",revision:"fe375c37b51ced4e61b89b4e37416a9c"},{url:"util.js",revision:"67112b5ac06b03ca4f8d5e89f5825f8b"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
