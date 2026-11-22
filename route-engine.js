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
 function layout(route,originX,originY,endX,maxMonths,comparisonMax){
  if(!validRoute(route))return null;
  const last=Number(route.steps[route.steps.length-1].target_value);
  const baseline=Number(route.metric_baseline);
  const total=(Number.isFinite(Number(comparisonMax))&&Number(comparisonMax)>last?Number(comparisonMax):last)-baseline;
  const duration=Math.max(1,Number(maxMonths)||route.steps[route.steps.length-1].months_from_start);
  const x0=Number(originX),y0=Number(originY);
  if(![x0,y0,Number(endX)].every(Number.isFinite)||endX<=x0)return null;
  const rise=Math.max(0,y0-29);
  return [[x0,y0],...route.steps.map(step=>{
   const ratio=total>0?Math.max(0,Math.min(1,(Number(step.target_value)-baseline)/total)):0;
   return [x0+(endX-x0)*step.months_from_start/duration,y0-rise*ratio];
  })];
 }
 function sharedComparisonMax(route,routes){
  if(!validRoute(route)||!Array.isArray(routes))return null;
  const key=r=>String(r.metric||'').trim().toLowerCase()+'|'+String(r.metric_unit||'').trim().toLowerCase();
  const compatible=routes.filter(r=>validRoute(r)&&key(r)===key(route)&&Number(r.metric_baseline)===Number(route.metric_baseline));
  return compatible.length>1?Math.max(...compatible.map(r=>Number(r.steps[r.steps.length-1].target_value))):null;
 }
 function diagnoseRoute(route){
  if(!validRoute(route))return {matches:false,reason:'Invalid milestone targets or chronology'};
  const s=route.steps,base=Number(route.metric_baseline);
  const gains=s.map((v,i)=>Number(v.target_value)-(i?Number(s[i-1].target_value):base));
  const months=s.map((v,i)=>v.months_from_start-(i?s[i-1].months_from_start:0));
  const velocity=gains.map((g,i)=>g/months[i]);
  const total=gains.reduce((a,b)=>a+b,0);
  if(total<=0)return {matches:false,reason:'No measurable advancement from baseline'};
  const n=gains.length,half=Math.max(1,Math.floor(n/2));
  const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
  const early=mean(velocity.slice(0,half)),late=mean(velocity.slice(half));
  const endEarly=velocity[0],endLate=velocity[n-1];
  const nearZero=gains.filter(g=>g<=Math.max(.01,total*.025)).length;
  const largest=Math.max(...gains);
  const topTwo=[...gains].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0);
  let matches=true,reason='';
  switch(route.id){
   case 'steady':
    // A measured gradual increase, with no single speculative breakthrough
    // making up the overwhelming majority of progress.
    matches=largest/total<.52&&nearZero<=Math.ceil(n*.5);
    reason='Steady growth needs several material incremental gains, not one breakthrough';
    break;
   case 'hockey':
    matches=n>=3&&late>early*1.75&&endLate>endEarly*1.6&&gains.slice(-half).reduce((a,b)=>a+b,0)>total*.56;
    reason='Hockey stick needs demonstrably accelerating progress per month after early validation';
    break;
   case 's':
    matches=n>=4&&Math.max(...velocity.slice(1,-1))>Math.max(velocity[0],velocity[n-1])*1.35&&velocity[n-1]<Math.max(...velocity.slice(1,-1))*.68;
    reason='S-curve needs a fast middle adoption phase followed by slower marginal gains';
    break;
   case 'steps':
    matches=(nearZero>=1||velocity.some((v,i)=>i>0&&v<velocity[i-1]*.25))&&largest/total>.32&&topTwo/total>.56;
    reason='Step changes need a plateau or preparation period and one or two evidence-backed, disproportionately large breakthroughs';
    break;
   case 'long':
    // Long R&D is not assumed to mean flat technical progress; the essential
    // distinction is a substantial technical development horizon.
    matches=s.some(v=>v.months_from_start>=18)&&String(route.metric_type||'').toLowerCase()!=='commercial'&&
      (String(route.metric||'')+' '+String(route.metric_unit||'')).toLowerCase().match(/readiness|prototype|technical|validation|capability|reliability|performance|certification|trl|test|field|regulator/)!==null;
    reason='Long R&D should show a substantial technical validation horizon before presumed commercial scaling';
    break;
  }
  return {matches,reason:matches?'Route profile reflects its stated strategy':reason,velocity,gains,total,early,late,nearZero};
 }

 // Conditional route overlays use the measured changes between proposed
 // cumulative targets, not a fixed increment per checkpoint. All values are
 // RELATIVE validation illustration units, never observed evidence or a
 // probability of reaching the target.
 function routeValidationDeltas(route){
  if(!validRoute(route))return [];
  const base=Number(route.metric_baseline);
  const targets=route.steps.map(s=>Number(s.target_value));
  const gains=targets.map((target,i)=>Math.max(0,target-(i?targets[i-1]:base)));
  const total=gains.reduce((a,b)=>a+b,0);
  if(total<=0)return gains.map(()=>0);
  // Potential sets the modest illustrative envelope; milestone target changes
  // distribute it across the chronology. Plateaus remain perfectly flat.
  const potential=route.steps.reduce((sum,step)=>
   sum+Math.min(5,Math.max(0,Number(step.value??step.potential_value??3)||0))*.16,0);
  const envelope=Math.min(7.5,potential);
  return gains.map(g=>Number((envelope*g/total).toFixed(6)));
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
 return {ROUTES,validRoute,layout,inspectRouteShapes,sharedComparisonMax,diagnoseRoute,routeValidationDeltas};
});
