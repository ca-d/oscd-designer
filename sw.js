if(!self.define){let e,s={};const i=(i,c)=>(i=new URL(i+".js",c).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(c,r)=>{const n=e||("document"in self?document.currentScript.src:"")||location.href;if(s[n])return;let o={};const d=e=>i(e,n),t={module:{uri:n},exports:o,require:d};s[n]=Promise.all(c.map((e=>t[e]||d(e)))).then((e=>(r(...e),o)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"2e01e0d960110534dfa176e06f7ea140"},{url:"icons.js",revision:"b4763d4c2cc027fe15eee3e00d83651e"},{url:"oscd-designer.js",revision:"af71f407ac84ad1ed11d7e3e7c8391e7"},{url:"oscd-designer.spec.js",revision:"897ac1a117aede5cb48bbc39ce199f1b"},{url:"sld-editor.js",revision:"c3ad37a548c4e62a96107d9a27c284cc"},{url:"util.js",revision:"76d42eb2ed371f2ba777a5ec4451be95"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
