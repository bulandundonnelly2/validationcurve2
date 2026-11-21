/* Pure route projection geometry shared by the app and regression tests.
   Reported milestones and verified evidence are never inferred from proposed targets.
   Horizontal axis = months from the shared journey origin.
   Vertical axis = route-specific metric, normalized ONLY for display. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ValidationRouteEngine=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const ROUTES=['steady','hockey','s','steps','long'];
 function validRoute(route){
  if(!route||!ROUTES.includes(route.id)||!Array.isArray(route.steps)||route.steps.length<2)return false;
  let amount=Number(route.metric_baseline),month=0;
  if(!Number.isFinite(amount)||amount<0)return false;
  for(const step of route.steps){
   if(!Number.isInteger(step.months_from_start)||step.months_from_start<=month||!Number.isFinite(Number(step.target_value))||Number(step.target_value)<amount)return false;
   month=step.months_from_start;amount=Number(step.target_value);
  }
  return true;
 }
 function layout(route,originX,originY,endX,maxMonths){
  if(!validRoute(route))return null;
  const last=Number(route.steps[route.steps.length-1].target_value);
  const baseline=Number(route.metric_baseline);
  const total=last-baseline;
  const duration=Math.max(1,Number(maxMonths)||route.steps[route.steps.length-1].months_from_start);
  const x0=Number(originX),y0=Number(originY);
  if(![x0,y0,Number(endX)].every(Number.isFinite)||endX<=x0)return null;
  const rise=Math.max(0,y0-29);
  return [[x0,y0],...route.steps.map(step=>{
   const ratio=total>0?Math.max(0,Math.min(1,(Number(step.target_value)-baseline)/total)):0;
   return [x0+(endX-x0)*step.months_from_start/duration,y0-rise*ratio];
  })];
 }
 function inspectRouteShapes(routes){
  const output={};
  for(const route of routes){
   const coords=layout(route,75,153,1550,Math.max(...routes.map(r=>r.steps.at(-1).months_from_start)));
   if(!coords)throw Error('Invalid route: '+route.id);
   output[route.id]=coords;
  }
  return output;
 }
 return {ROUTES,validRoute,layout,inspectRouteShapes};
});
