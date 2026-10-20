/* HUD appearance: explicit override or browser-reported OS color scheme.
 * This changes UI chrome only; it does not touch map sources or data layers. */
(()=>{
  "use strict";
  const key="stratlas:hudTheme";
  const accepted=new Set(["system","light","dark"]);
  const preference=window.matchMedia("(prefers-color-scheme: dark)");
  let selection="system";
  try{
    const saved=window.localStorage.getItem(key);
    if(accepted.has(saved))selection=saved;
  }catch{ /* Browser storage can be disabled. */ }
  const resolve=()=>selection==="system"
    ? (preference.matches?"dark":"light") : selection;
  function apply(){
    const actual=resolve();
    document.documentElement.dataset.hudTheme=actual;
    document.documentElement.dataset.hudPreference=selection;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",actual==="dark"?"#142230":"#fbfdff"
    );
    const readout=document.getElementById("hud-theme-status");
    if(readout)readout.textContent=selection==="system"
      ? "System · browser reports "+actual
      : "Manual · "+actual;
  }
  function choose(value){
    if(!accepted.has(value))return;
    selection=value;
    try{window.localStorage.setItem(key,value)}catch{ /* Ephemeral choice. */ }
    apply();
  }
  preference.addEventListener?.("change",()=>{
    if(selection==="system")apply();
  });
  apply(); // Before loading CSS prevents a wrong-theme flash.
  document.addEventListener("DOMContentLoaded",()=>{
    const selector=document.getElementById("hud-theme");
    if(selector){
      selector.value=selection;
      selector.addEventListener("change",()=>choose(selector.value));
    }
    apply();
  });
})();
