if(!self.define){let e,s={};const c=(c,i)=>(c=new URL(c+".js",i).href,s[c]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=c,e.onload=s,document.head.appendChild(e)}else e=c,importScripts(c),s()})).then((()=>{let e=s[c];if(!e)throw new Error(`Module ${c} didn’t register its module`);return e})));self.define=(i,r)=>{const n=e||("document"in self?document.currentScript.src:"")||location.href;if(s[n])return;let o={};const d=e=>c(e,n),t={module:{uri:n},exports:o,require:d};s[n]=Promise.all(i.map((e=>t[e]||d(e)))).then((e=>(r(...e),o)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"4ff6379b97c9c6e20cc523a6b078a424"},{url:"icons.js",revision:"9c1f23b5d642cd031f6d4710de9588d8"},{url:"oscd-designer.js",revision:"289aba19ff9abf9e4038349ecc479c4b"},{url:"oscd-designer.spec.js",revision:"5f74fbde5d1d44a5e3fc3ba850bfcc23"},{url:"sld-editor.js",revision:"ef14d3c43aa455ca4543a92777c8b9e2"},{url:"util.js",revision:"ff031c881c40a9342ca3d562e27cf651"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
