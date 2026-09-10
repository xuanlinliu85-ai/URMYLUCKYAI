// 探针 v4：把错误监听器注入到 <head> 之后（早于主脚本），才能抓到真正中断点
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
let html = readFileSync(resolve(root, "public/macro-workbench.html"), "utf8");

const early = `
<script>
window.__ERRS__=[];
window.addEventListener("error",function(e){window.__ERRS__.push("ERROR: "+e.message+"  @line "+(e.lineno||"?")+":"+(e.colno||"?"));});
var _ce=console.error;
console.error=function(){window.__ERRS__.push("console.error: "+Array.prototype.slice.call(arguments).join(" "));try{_ce.apply(console,arguments);}catch(x){}};
<\/script>
`;
const headIdx = html.indexOf("</head>");
html = html.slice(0, headIdx + 7) + early + html.slice(headIdx + 7);

const probe = `
<div id="__diag" style="position:fixed;left:0;top:0;z-index:99999;background:#fff;color:#b00;font:11px monospace;padding:6px;width:900px;max-height:100vh;overflow:auto"></div>
<script>
(function(){
  var out=[];
  out.push("JS 错误数: "+(window.__ERRS__?window.__ERRS__.length:"?"));
  if(window.__ERRS__&&window.__ERRS__.length) out.push(window.__ERRS__.join("\\n"));
  var no=[];
  document.querySelectorAll(".chart").forEach(function(n){
    if(!n.querySelector("canvas")) no.push(n.id||"(no-id)");
  });
  out.push("未渲染的图表: "+(no.length?no.join(", "):"无"));
  document.getElementById("__diag").textContent=out.join("\\n");
})();
<\/script>
`;
const idx = html.lastIndexOf("</html>");
html = html.slice(0, idx) + probe + html.slice(idx);
writeFileSync(resolve(root, "work/macro/__diag4.html"), html, "utf8");
console.log("ok");
