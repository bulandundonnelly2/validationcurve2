'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function sourceBetween(a,b){
 const start=html.indexOf(a),end=html.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'Missing source section '+a);
 return html.slice(start,end);
}
test('All inline app scripts parse',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).filter(s=>s.trim());
 assert.ok(scripts.length);
 scripts.forEach(s=>new vm.Script(s));
});
function engine(){
 const src=sourceBetween('function inferMilestoneOutcome(', 'function contextualMilestoneValue(');
 return vm.runInNewContext(src+'\n({milestoneImpact,cumulativeMilestonePositions,projectedMilestonePositions,validationImpactBand,milestoneNovelty,normalizedMilestoneStatus});',{
  milestoneRelevance:m=>m.value_assessment?.relevance===0?{score:0,reason:'Irrelevant'}:{score:1,reason:'Relevant'},
  milestoneEvidenceQuality:m=>m.testQuality||{score:m.reported_evidence?20:0,confidence:m.reported_evidence?.2:0,band:'Unverified',notes:[]},
  milestoneLinkedEvidence:()=>[],
  state:{comparisonBusinessType:'Software / SaaS'},
  inferredBusinessType:()=> 'Software / SaaS',
  planVentureContext:()=>({stage:'Seed'}),
  entryRating:()=>({score:1})
 });
}
const score=engine();
const achieved=v=>({value:v,achieved:true});
const planned=v=>({value:v,achieved:false});
test('Positive 2.6 then 1.4 accumulates to 4.0 instead of dipping',()=>{
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions([achieved(2.6),achieved(1.4)])),[2.6,4]);
});
test('Neutral stays flat and a negative two-unit milestone lowers the curve',()=>{
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions([achieved(2.6),achieved(0),achieved(-2)])),[2.6,2.6,.6]);
});
test('A smaller positive after a breakthrough continues rising',()=>{
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions([achieved(6),achieved(.4)])),[6,6.4]);
});
test('Planned and in-progress results cannot change actual validation',()=>{
 const actual=score.cumulativeMilestonePositions([achieved(2),planned(4),planned(-3)]);
 assert.deepEqual(Array.from(actual),[2,2,2]);
});
test('Changing planned to achieved recalculates all downstream positions',()=>{
 const impacts=[achieved(2),planned(1.5),achieved(-1)];
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions(impacts)),[2,2,1]);
 impacts[1].achieved=true;
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions(impacts)),[2,3.5,2.5]);
});
test('Editing or deleting earlier milestones recomputes every later score',()=>{
 const impacts=[achieved(2),achieved(1),achieved(-.5)];
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions(impacts)),[2,3,2.5]);
 impacts[0].value=3;
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions(impacts)),[3,4,3.5]);
 impacts.splice(1,1);
 assert.deepEqual(Array.from(score.cumulativeMilestonePositions(impacts)),[3,2.5]);
});
test('Irrelevant Had a Coke always has zero impact even if marked achieved',()=>{
 const m={title:'Had a Coke',status:'Achieved',value_assessment:{relevance:0},
  reported_evidence:'Had a Coke'};
 assert.equal(score.milestoneImpact(m,5,'positive').value,0);
});
test('Achieved negative is a scored setback, never a planned forecast',()=>{
 const m={title:'Field trial failed',status:'Achieved',reported_evidence:'Devices failed',
  testQuality:{score:70,confidence:.7,band:'Documented'}};
 const result=score.milestoneImpact(m,4,'negative');
 assert.ok(result.value<0);
 assert.equal(result.achieved,true);
 assert.equal(result.actualBand.color,'#b94f55');
});
test('Strongly evidenced exceptional financing can reach transformative band',()=>{
 const m={title:'Secured $1 million in investment',status:'Achieved',
  reported_evidence:'Received $1 million investment',
  evidence_source_type:'independent',evidence_source_url:'https://example.org/financing',
  testQuality:{score:85,confidence:.85,band:'Documented'}};
 const result=score.milestoneImpact(m,5,'positive');
 assert.ok(result.value>=5&&result.value<=8);
 assert.equal(result.transformative,true);
 assert.equal(result.actualBand.label,'Transformative breakthrough');
});
test('Unverified funding claim never automatically earns exceptional score',()=>{
 const m={title:'Secured $1 million in investment',status:'Achieved',
  reported_evidence:'Received $1 million investment',
  testQuality:{score:20,confidence:.2,band:'Founder reported'}};
 const result=score.milestoneImpact(m,5,'positive');
 assert.ok(result.value<=.9);
 assert.equal(result.transformative,false);
});
test('Duplicate observed evidence earns no fresh validation',()=>{
 const previous={title:'Paid customer pilot',status:'Achieved',reported_evidence:'Ten customers paid'};
 const current={...previous};
 const result=score.milestoneImpact(current,5,'positive',[previous]);
 assert.equal(result.value,0);
});
test('Original value and stage remain separate from evidence confidence',()=>{
 const m={title:'Customer retention',status:'Achieved',reported_evidence:'Retained customers',
  testQuality:{score:20,confidence:.2,band:'Founder'}};
 const result=score.milestoneImpact(m,5,'positive');
 assert.ok(result.value>0&&result.value<=.9);
 assert.ok(result.assessment.evidenceQuality===20);
});
test('Forecast is distinct from actual and zero if milestone is unachieved',()=>{
 const m={title:'Future customer milestone',status:'In progress'};
 const result=score.milestoneImpact(m,4,'none');
 assert.equal(result.value,0);
 assert.ok(result.projected>0);
 const values=score.projectedMilestonePositions([achieved(1),result],[1,1]);
 assert.equal(values[0],1);
 assert.ok(values[1]>1);
});
test('Graph uses outcome colours, node magnitude and stage-specific connector styles',()=>{
 assert.match(html,/VALIDATION_IMPACT_COLORS/);
 assert.match(html,/Math\.max\(9,Math\.min\(23,9\+value\*1\.8\)\)/);
 assert.match(html,/impact\.transformative\?'<circle/);
 assert.match(html,/p\.status==='In progress'\?'2 7':'6 9'/);
 assert.match(html,/actualPaths\+pendingPaths\+futurePaths/);
 assert.match(html,/id="actualValidationLedger"/);
 assert.match(html,/id="scenarioValidationLines"/);
});
test('Five route families remain available without changing achieved scores',()=>{
 for(const id of ["'steady'","'hockey'","'s'","'steps'","'long'"]){
  assert.ok(html.includes('id:'+id),'Missing growth route '+id);
 }
 assert.match(html,/function routeShapeCheck/);
 assert.match(html,/function adaptiveRouteReview/);
 assert.match(html,/const plotValues=cumulativeMilestonePositions\(milestoneImpacts\)/);
});
test('Milestone edit, evidence attachment and delete actions remain accessible',()=>{
 assert.match(html,/data-remove-attached-evidence/);
 assert.match(html,/data-attached-evidence/);
 assert.match(html,/directEditor\.onsubmit=async/);
 assert.match(html,/deleteMilestone\.onclick/);
 assert.match(html,/quickEdit\.onclick/);
});

test('Experiment marked Achieved without observed result stays at forecast height, not zero',()=>{
 const planned={title:'Experiment: repeat customer trial',status:'Not started'};
 const before=score.milestoneImpact(planned,4,'none');
 const prior=[{value:1.2,achieved:true,hasScoredOutcome:true,projected:0}];
 const beforeActual=score.cumulativeMilestonePositions([...prior,before]);
 const beforeProjected=score.projectedMilestonePositions([...prior,before],beforeActual);
 const after=score.milestoneImpact({...planned,status:'Achieved'},4,'none');
 const afterActual=score.cumulativeMilestonePositions([...prior,after]);
 const afterProjected=score.projectedMilestonePositions([...prior,after],afterActual);
 assert.equal(after.achieved,true);
 assert.equal(after.hasScoredOutcome,false);
 assert.equal(after.pendingEvidence,true);
 assert.equal(after.value,0);
 assert.equal(afterActual[1],1.2);
 assert.equal(afterProjected[1],beforeProjected[1]);
 assert.ok(afterProjected[1]>afterActual[1]);
});
test('Submitting a documented result scores actual outcome and replaces provisional position',()=>{
 const milestone={title:'Experiment: repeat customer trial',status:'Achieved',
  reported_evidence:'Customers paid for a repeat trial',
  evidence_direction:'positive',testQuality:{score:70,confidence:.70,band:'Documented'}};
 const after=score.milestoneImpact(milestone,4,'positive');
 assert.equal(after.pendingEvidence,false);
 assert.equal(after.hasScoredOutcome,true);
 assert.ok(after.value>0);
 const history=[{value:1.2,achieved:true,hasScoredOutcome:true,projected:0},after];
 const actual=score.cumulativeMilestonePositions(history);
 const predicted=score.projectedMilestonePositions(history,actual);
 assert.equal(predicted[1],actual[1]);
});
test('Pending achieved experiments receive muted solid connectors instead of a drop to baseline',()=>{
 assert.match(html,/pendingSegments\.push/);
 assert.match(html,/pendingPaths/);
 assert.match(html,/Achieved milestone · visually connected/);
 assert.match(html,/Achieved · awaiting outcome assessment/);
});

test('Achieving milestone 3 out of order preserves a connected negative movement instead of resetting to zero',()=>{
 const earlier=[
  {value:0,achieved:false,hasScoredOutcome:false,projected:1.25},
  {value:0,achieved:false,hasScoredOutcome:false,projected:.65},
  {value:0,achieved:false,hasScoredOutcome:false,projected:-.30},
  {value:0,achieved:false,hasScoredOutcome:false,projected:1.20}
 ];
 const beforeActual=score.cumulativeMilestonePositions(earlier);
 const before=Array.from(score.projectedMilestonePositions(earlier,beforeActual));
 assert.deepEqual(before,[1.25,1.9,1.6,2.8]);
 earlier[2]={value:-.19,achieved:true,hasScoredOutcome:true,projected:-.30};
 const afterActual=score.cumulativeMilestonePositions(earlier);
 const after=Array.from(score.projectedMilestonePositions(earlier,afterActual));
 assert.deepEqual(after,[1.25,1.9,1.71,2.91]);
 assert.ok(after[2]<after[1]);
 assert.equal(afterActual[2],-.19);
 assert.ok(Math.abs((after[2]-after[1])+.19)<1e-9);
});
test('Achieving a positive milestone out of order raises the connected journey and recalculates downstream points',()=>{
 const items=[
  {value:0,achieved:false,hasScoredOutcome:false,projected:.7},
  {value:0,achieved:false,hasScoredOutcome:false,projected:1.1},
  {value:0,achieved:false,hasScoredOutcome:false,projected:.8}
 ];
 const before=score.projectedMilestonePositions(items,score.cumulativeMilestonePositions(items));
 items[1]={value:.35,achieved:true,hasScoredOutcome:true,projected:1.1};
 const after=score.projectedMilestonePositions(items,score.cumulativeMilestonePositions(items));
 assert.deepEqual(Array.from(after),[.7,1.05,1.85]);
 assert.ok(after[1]>after[0]);
 assert.ok(after[1]<before[1]);
});
test('Connected segments always start from the immediately preceding displayed point',()=>{
 assert.match(html,/let previous=\[78,scoreY\(0\)\]/);
 assert.match(html,/const path=segment\(previous,end\)/);
 assert.match(html,/previous=end/);
 assert.doesNotMatch(html,/segment\(actualPrevious,end\)/);
});

test('Irrelevant milestones prompt removal while business milestones with missing evidence do not',()=>{
 const src=sourceBetween('function milestoneRemovalRecommendation(m){','function inferMilestoneOutcome(m){');
 const recommendation=vm.runInNewContext(src+';milestoneRemovalRecommendation',{
  milestoneRelevance:m=>m.value_assessment?.relevance===0?
   {score:0,reason:'No business connection'}:{score:1,reason:'Relevant to business'}
 });
 assert.match(recommendation({title:'Had a Coke',value_assessment:{relevance:0}}).reason,/Consider removing/);
 assert.equal(recommendation({title:'50 prospective customers',value_assessment:{relevance:1}}),null);
 assert.equal(recommendation({title:'Signed contract, evidence pending'}),null);
});
test('Milestone removal controls appear in the selected journey and reuse existing edit/delete handlers',()=>{
 assert.match(html,/data-advice-remove/);
 assert.match(html,/data-advice-edit/);
 assert.match(html,/removalAdvice\.hidden=!removal/);
 assert.ok(html.includes("removalAdvice.querySelector('[data-advice-remove]').onclick=()=>deleteMilestone.click()"));
 assert.ok(html.includes("removalAdvice.querySelector('[data-advice-edit]').onclick=()=>quickEdit.click()"));
});

test('Experiment add action is presented before the long evidence criteria',()=>{
 const start=html.indexOf('function renderValidationAdviser()');
 const end=html.indexOf('const openAt=i=>',start);
 const adviser=html.slice(start,end);
 assert.ok(adviser.includes('＋ Add experiment as milestone'));
 assert.ok(adviser.indexOf('sheet.appendChild(experimentActionRow)')<adviser.indexOf("const criteria=el('div','decision-criteria')"));
 assert.equal((adviser.match(/const add=el\('button','decision-primary'/g)||[]).length,1);
 assert.match(adviser,/plan\.milestones\.splice\(i\+1,0/);
});
test('Expanded experiment panel offers scroll room below the last item',()=>{
 assert.match(html,/padding-bottom:clamp\(32px,8vh,100px\)/);
 assert.match(html,/\.experiment-action-row/);
});

test('Scoring disclosure is discreet, opt-in and reflects cumulative scoring',()=>{
 assert.match(html,/id="scoreFormulaToggle"/);
 assert.match(html,/scoreInfo\.hidden=true/);
 assert.match(html,/scoreToggle\.onclick=\(\)=>toggleFormula\(scoreInfo\.hidden\)/);
 assert.match(html,/Vₙ = Vₙ₋₁ \+ ΔVₙ/);
 assert.match(html,/0\.22 \+ 0\.78/);
 assert.match(html,/below 40 caps impact at 0\.90/);
 assert.match(html,/below 65 caps it at 2\.90/);
 assert.match(html,/not a business valuation/);
 assert.match(html,/score-formula-info'\)\?\.remove\(\)/);
});

test('PowerPoint upload exposes API errors and keeps existing curve on invalid results',()=>{
 const submit=sourceBetween("$('#planForm').onsubmit=async", 'const ambitionProfiles=');
 assert.match(submit,/let data=await r\.json\(\)\.catch\(\(\)=>\(\{\}\)\)/);
 assert.match(submit,/The analysis returned no usable milestones/);
 assert.match(submit,/if\(!r\.ok\)throw Error\(data\.error/);
 assert.match(submit,/Analysis timed out while processing the file/);
});
test('PowerPoint remains an accepted document and uses the same analysis endpoint',()=>{
 assert.match(html,/accept="\.pdf,\.pptx,\.docx,\.txt"/);
 const submit=sourceBetween("$('#planForm').onsubmit=async", 'const ambitionProfiles=');
 assert.match(submit,/mode:'plan'/);
 assert.match(submit,/file:base64/);
});

test('New document upload hides editor before rendering and refits after layout',()=>{
 const submit=sourceBetween("$('#planForm').onsubmit=async", 'const ambitionProfiles=');
 const completion=submit.slice(submit.indexOf("chartZoom=1;"));
 assert.ok(completion.indexOf("$('#planForm').hidden=true")<completion.indexOf('renderPlan()'));
 assert.match(completion,/renderPlan\(\);\$\('#planForm'\)\.reset\(\);\$\('#selectedPlanFile'\)\.textContent='';scheduleChartFit\(\)/);
});
test('Graph initially fits after layout and observes container resize',()=>{
 assert.match(html,/function scheduleChartFit\(\)/);
 assert.match(html,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(/);
 assert.match(html,/new ResizeObserver\(\(\)=>scheduleChartFit\(\)\)/);
 assert.match(html,/!chart\.dataset\.fitObserverReady/);
 assert.match(html,/if\(chart\.clientWidth<=0\|\|chart\.clientHeight<=0\)return/);
 assert.match(html,/curve-layout-dispose/);
});

test('All reference routes start at the shared graph zero, not the most recent milestone',()=>{
 const overlay=sourceBetween('function plotSharedSignalRoute(', 'function drawReferenceCurves(');
 assert.match(overlay,/const startX=78;/);
 assert.match(overlay,/const startY=sharedSignalY\(0,svg\)/);
 assert.match(overlay,/let score=0;/);
 assert.match(overlay,/const pts=\[\[startX,startY\]\]/);
 assert.doesNotMatch(overlay,/lastNode|startScore|dataset\.signalScore/);
 const renderer=sourceBetween('function drawReferenceCurves(', 'function openHistoricalComparison(');
 assert.match(renderer,/Independent growth routes starting at zero/);
 assert.doesNotMatch(renderer,/anchorX|anchorY|last=reported/);
});
test('Shared chart axis includes projected zero-origin route scores without adding current validation',()=>{
 const frame=sourceBetween('function renderPlan(){', 'function milestoneRemovalRecommendation(');
 const routeSection=frame.slice(frame.indexOf('const routeScores='));
 assert.match(routeSection,/return changes\?\.length===steps\.length\?changes\.reduce/);
 assert.doesNotMatch(routeSection.slice(0,460),/anchorScore|projectedValues\.at\(-1\)/);
});

test('Investor conversations are not treated like an investment breakthrough',()=>{
 const m={title:'Spoke with 3 VC investors',status:'Not started',value_assessment:{relevance:1}};
 const planned=score.milestoneImpact(m,5,'none');
 assert.equal(planned.value,0);
 assert.ok(planned.projected>=0&&planned.projected<=.15,'Unverified VC meeting forecast is capped');
 assert.equal(planned.activityCeiling?.actual,.2);
 const assessed=score.milestoneImpact({...m,status:'Achieved',reported_evidence:'Three investors attended the meeting',testQuality:{score:85,confidence:.85,band:'Documented'}},5,'positive');
 assert.ok(assessed.value<=.2,'Documented conversation remains an activity, not capital or traction');
 assert.equal(assessed.transformative,false);
});
test('Investor due diligence, term sheet and committed funding have different score ceilings',()=>{
 const strong={status:'Achieved',reported_evidence:'The relevant event was completed',testQuality:{score:85,confidence:.85,band:'Documented'}};
 const diligence=score.milestoneImpact({...strong,title:'Investor requested due diligence'},5,'positive');
 const termSheet=score.milestoneImpact({...strong,title:'Signed a term sheet'},5,'positive');
 const funded=score.milestoneImpact({...strong,title:'Secured $1 million in investment',reported_evidence:'Received $1 million investment',evidence_source_type:'independent',evidence_source_url:'https://example.org/financing'},5,'positive');
 assert.ok(diligence.value<=.8);
 assert.ok(termSheet.value<=2);
 assert.ok(funded.value>termSheet.value,'Completed major financing outranks interest and terms');
});
test('Paid customers and negative field trial outcomes retain meaningful signed validation',()=>{
 const observed={status:'Achieved',reported_evidence:'Customers paid',testQuality:{score:85,confidence:.85,band:'Documented'}};
 const paid=score.milestoneImpact({...observed,title:'50 paying customers'},5,'positive');
 const negative=score.milestoneImpact({...observed,title:'Field trial failed',reported_evidence:'Devices failed repeatedly'},4,'negative');
 assert.ok(paid.value>1,'Commercial outcomes are not capped as networking');
 assert.ok(negative.value<0,'Real negative evidence creates a setback');
});
test('Forecast is muted grey dashed while the actual ledger is separate',()=>{
 assert.match(html,/stroke="#b2c1b8" stroke-opacity="\.46"/);
 assert.match(html,/const actualLedgerPaths=/);
 assert.match(html,/scoreY\(plotValues\[i\]\)/);
 assert.match(html,/Actual validated /);
 assert.match(html,/Unverified scenario /);
 assert.match(html,/Activity ceilings:/);
 assert.match(html,/raw potential × 0\.27 × novelty/);
});

test('Manual score adjusts a planned milestone but never creates actual validation',()=>{
 const result=score.milestoneImpact({title:'Spoke with 3 VCs',status:'Not started',manual_impact:1.95},5,'none');
 assert.equal(result.projected,1.95);
 assert.equal(result.value,0);
 assert.equal(result.hasScoredOutcome,false);
 assert.equal(result.manualOverride,true);
 assert.match(result.note,/USER-ADJUSTED/);
});
test('Manual score supports negative planned setbacks and zero',()=>{
 const negative=score.milestoneImpact({title:'Potential field trial',status:'Not started',manual_impact:-1.5},4,'none');
 assert.equal(negative.projected,-1.5);
 assert.equal(negative.value,0);
 const neutral=score.milestoneImpact({title:'Investor meeting',status:'Not started',manual_impact:0},5,'none');
 assert.equal(neutral.projected,0);
});
test('Documented achieved milestones accept signed manual impacts',()=>{
 const observed={status:'Achieved',reported_evidence:'Observed results',testQuality:{score:85,confidence:.85,band:'Documented'}};
 assert.equal(score.milestoneImpact({...observed,title:'Customers paid',manual_impact:2.45},5,'positive').value,2.45);
 assert.equal(score.milestoneImpact({...observed,title:'Field trial failure',manual_impact:-1.75},4,'negative').value,-1.75);
});
test('Manual score cannot mark an unproven achievement as validated',()=>{
 const result=score.milestoneImpact({title:'Investor conversation',status:'Achieved',manual_impact:6,evidence_direction:'unclear'},5,'none');
 assert.equal(result.value,0);
 assert.equal(result.projected,6);
 assert.equal(result.hasScoredOutcome,false);
 assert.equal(result.pendingEvidence,true);
});
test('Manual score can challenge AI relevance but does not invent observed evidence',()=>{
 const m={title:'Uncategorised milestone',status:'Not started',value_assessment:{relevance:0,potential_value:0},manual_impact:.7};
 const result=score.milestoneImpact(m,0,'none');
 assert.equal(result.projected,.7);
 assert.equal(result.value,0);
});
test('Clearing the override returns to the automatic activity ceiling',()=>{
 const m={title:'Spoke with 3 VCs',status:'Not started',manual_impact:1.95};
 const adjusted=score.milestoneImpact(m,5,'none');
 delete m.manual_impact;
 const automatic=score.milestoneImpact(m,5,'none');
 assert.equal(adjusted.projected,1.95);
 assert.ok(automatic.projected<=.15);
 assert.equal(automatic.manualOverride,false);
});
test('Manual override UI has score validation, reason, reset and automatic comparison',()=>{
 assert.match(html,/name="manual_impact" type="number" min="-8" max="8" step="0.01"/);
 assert.match(html,/name="manual_impact_reason"/);
 assert.match(html,/delete m\.manual_impact/);
 assert.match(html,/selectedOutcome==='positive'&&proposedManual<0/);
 assert.match(html,/Edit milestone \/ score/);
 assert.match(html,/data-automatic-impact/);
 assert.match(html,/USER-ADJUSTED/);
});

test('Achieved milestone circles are complete even when evidence is pending',()=>{
 const points=sourceBetween('const pointMarkup=points.map', "box.innerHTML='<div class=\"milestone-map\">");
 assert.match(points,/const inner=impact\.achieved\?color/);
 assert.match(points,/const innerOpacity=impact\.achieved\?'1'/);
 assert.match(points,/const strokeDash=impact\.achieved\?'':'stroke-dasharray="3 6"'/);
 assert.match(points,/impact\.achieved\?'#9bc6a7'/);
});
test('Achieved incoming connectors are solid regardless of earlier forecasts',()=>{
 const graph=sourceBetween('const actualSegments=[]', 'const pointMarkup=points.map');
 assert.match(graph,/else if\(impact\.achieved\)/);
 assert.match(graph,/pendingSegments\.push\(\{d:path/);
 assert.match(graph,/stroke="#b2c1b8" stroke-opacity="\.85" stroke-width="3\.2"/);
 assert.doesNotMatch(graph,/stroke-dasharray="3 7"/);
});
test('Provisional route overlay never paints a dashed line over an achieved segment',()=>{
 const journey=sourceBetween('function applyJourneyMode(){','/* Milestone assessment uses');
 assert.match(journey,/reported:normalizedMilestoneStatus\(m\)==='Achieved'/);
 assert.match(journey,/if\(previousValid&&!current\.reported\)/);
});
test('Visual completion does not fabricate an assessed result or change the scoring formula',()=>{
 const plan=sourceBetween('function milestoneImpact(', 'function contextualMilestoneValue(');
 assert.match(plan,/const actualEligible=status==='Achieved'&&hasObservation/);
 assert.match(plan,/const pendingEvidence=status==='Achieved'&&eligible&&!hasScoredOutcome/);
 const statusOnly=score.milestoneImpact({title:'Decision quality field test',status:'Achieved'},4,'none');
 assert.equal(statusOnly.value,0);
 assert.equal(statusOnly.hasScoredOutcome,false);
 assert.equal(statusOnly.pendingEvidence,true);
});

test('Actual ledger stops at last evidenced scoring event, not the future milestone tail',()=>{
 const src=sourceBetween('let actualPrev=[78,scoreY(0)]','const actualPaths=actualSegments.map');
 assert.match(src,/const lastScoredIndex=milestoneImpacts\.reduce/);
 assert.match(src,/impact\.hasScoredOutcome&&impact\.value!==0\?i:last,-1/);
 assert.match(src,/points\.slice\(0,lastScoredIndex\+1\)/);
 assert.doesNotMatch(src,/points\.map\(\(p,i\)=>/);
});
test('Evidence-only ledger is isolated from the combined curve',()=>{
 const src=sourceBetween('let actualPrev=[78,scoreY(0)]','const actualPaths=actualSegments.map');
 assert.match(src,/points\.slice\(0,lastScoredIndex\+1\)/);
 assert.match(src,/const path='<path d="'\+segment\(actualPrev,end\)/);
 assert.match(src,/actualPrev=end/);
 assert.doesNotMatch(src,/sameAsJourney/);
 const journey=sourceBetween('function applyJourneyMode(){','/* Milestone assessment uses');
 assert.match(journey,/ledger\.style\.display=evidenceOnly\?'':'none'/);
 assert.match(journey,/scenarios\.style\.display=evidenceOnly\?'none':''/);
});
test('Negative observed milestone joins its previous visible forecast in red',()=>{
 const src=sourceBetween('const actualSegments=[]','const pointMarkup=points.map');
 assert.match(src,/if\(impact\.hasScoredOutcome\)\{/);
 assert.match(src,/actualSegments\.push\(\{d:path,color:impact\.actualBand\.color\}\)/);
 assert.match(src,/const path=segment\(previous,end\)/);
 assert.match(src,/previous=end/);
 const before=score.projectedMilestonePositions([
  {value:0,achieved:false,hasScoredOutcome:false,projected:.25},
  {value:0,achieved:false,hasScoredOutcome:false,projected:.34},
  {value:-.90,achieved:true,hasScoredOutcome:true,projected:0}
 ]);
 assert.equal(Number(before[2].toFixed(2)),-.31);
 const actual=score.cumulativeMilestonePositions([
  {value:0,achieved:false},
  {value:0,achieved:false},
  {value:-.90,achieved:true}
 ]);
 assert.equal(actual[2],-.90);
});
test('Display still uses achieved solid connectors and independent forecast values',()=>{
 const graph=sourceBetween('const actualSegments=[]','const pointMarkup=points.map');
 assert.match(graph,/else if\(impact\.achieved\)/);
 assert.match(graph,/const path=segment\(previous,end\)/);
 assert.match(html,/const projectedValues=projectedMilestonePositions\(milestoneImpacts,plotValues\)/);
});

test('File selection directly invokes the plan submission handler and exposes retry',()=>{
 const change=sourceBetween('// Use the existing submit handler directly for automatic document analysis.',"$('#clearDemo').onclick");
 assert.match(change,/function submitSelectedPlanDocument\(\)/);
 assert.match(change,/form\.onsubmit\(\{preventDefault\(\)\{\}\}\)/);
 assert.match(change,/submitSelectedPlanDocument\(\);/);
 assert.doesNotMatch(change,/\.requestSubmit\(\)/);
 assert.match(change,/\$\('#retryPlanAnalysis'\)\.onclick=submitSelectedPlanDocument/);
});
test('Failed document processing keeps the selected PPTX and shows a visible retry action',()=>{
 const submit=sourceBetween("$('#planForm').onsubmit=async",'const ambitionProfiles=');
 assert.match(submit,/if\(file\)\{\$\('#selectedPlanFile'\)\.textContent=file\.name\+' · Analysis failed: '/);
 assert.match(submit,/\$\('#retryPlanAnalysis'\)\.hidden=false/);
 assert.match(submit,/if\(button\.disabled\)return/);
 assert.match(html,/id="retryPlanAnalysis" hidden/);
});

test('Historical document outcomes import as Achieved with founder-reported provenance',()=>{
 const src=sourceBetween('function importedMilestoneStatus(', "$('#planForm').onsubmit=async");
 const status=vm.runInNewContext(src+'\nimportedMilestoneStatus');
 const past={title:'Supervised field trial',reported_evidence:'Three sensors operated for 21 days',evidence_source:'Reported in uploaded pitch deck',evidence_direction:'positive'};
 assert.equal(status(past,true),'Achieved');
 assert.equal(status({...past,evidence_direction:'negative'},true),'Achieved');
 assert.equal(status({...past,evidence_direction:'mixed'},true),'Achieved');
 assert.equal(status({...past,evidence_direction:'unclear'},true),'Achieved');
 const submit=sourceBetween("$('#planForm').onsubmit=async", 'const ambitionProfiles=');
 assert.match(submit,/status:importedMilestoneStatus\(m,!!\(file\|\|\$\('#planResults'\)\.value\.trim\(\)\)\)/);
 assert.match(submit,/evidence_source_type:'founder'/);
});
test('Future, unsourced and no-outcome milestones stay Not started on PPTX import',()=>{
 const src=sourceBetween('function importedMilestoneStatus(', "$('#planForm').onsubmit=async");
 const status=vm.runInNewContext(src+'\nimportedMilestoneStatus');
 const past={reported_evidence:'Observed trial result',evidence_source:'Source excerpt',evidence_direction:'positive'};
 assert.equal(status(past,false),'Not started');
 assert.equal(status({...past,reported_evidence:''},true),'Not started');
 assert.equal(status({...past,evidence_source:''},true),'Not started');
 assert.equal(status({...past,evidence_direction:'none'},true),'Not started');
 assert.equal(status({title:'Planned customer pilot',reported_evidence:'',evidence_source:'',evidence_direction:'none'},true),'Not started');
});
test('Imported Achieved status alone never creates an actual validation score',()=>{
 const reported={title:'Field trial',status:'Achieved',reported_evidence:'Trial happened',evidence_source:'Pitch deck excerpt',evidence_direction:'unclear',evidence_source_type:'founder'};
 const impact=score.milestoneImpact(reported,4,'unclear');
 assert.equal(impact.value,0);
 assert.equal(impact.achieved,true);
 assert.equal(impact.hasScoredOutcome,false);
 const negative=score.milestoneImpact({...reported,evidence_direction:'negative'},4,'negative');
 assert.ok(negative.value<0);
 assert.ok(negative.quality.score<40,'Founder claim is not independently verified');
});

test('Empty start page hides unused graph placeholder while retaining the upload form',()=>{
 assert.match(html,/body:not\(\.curve-open\):not\(\.curve-loading\) #planView:has\(\.curve-placeholder\) \.curve-placeholder\{display:none!important\}/);
 assert.match(html,/body:not\(\.curve-open\):not\(\.curve-loading\) #planSection:has\(\.curve-placeholder\) #planForm/);
 assert.match(html,/id="planFile" accept="\.pdf,\.pptx,\.docx,\.txt"/);
 assert.match(html,/id="ambitions" maxlength="2000"/);
});
test('Full validation curve layout is not changed by compact empty-state CSS',()=>{
 const css=sourceBetween('/* The blank curve is not useful until there are milestones.', '</style>');
 assert.doesNotMatch(css,/body\.curve-open\s/);
 assert.match(css,/body:not\(\.curve-open\):not\(\.curve-loading\)/);
});

test('Compact start form exposes only three optional AI assessment questions',()=>{
 const form=sourceBetween('id="planForm"', '</form>');
 assert.match(form,/id="planBusinessType"/);
 assert.match(form,/value="Software \/ SaaS"/);
 assert.match(form,/value="Deep tech \/ Research"/);
 assert.match(form,/id="planStage"/);
 assert.match(form,/id="planResults"/);
 assert.match(form,/Milestones and results so far/);
 assert.match(form,/Not sure — suggest one/);
 assert.doesNotMatch(form,/required(?=[\s>])/);
});
test('Plan generation sends all three selections even with a PowerPoint upload',()=>{
 const handler=sourceBetween("$('#planForm').onsubmit=async",'const ambitionProfiles=');
 assert.match(handler,/ventureType:\$\('#planBusinessType'\)\.value/);
 assert.match(handler,/stage:\$\('#planStage'\)\.value/);
 assert.match(handler,/evidenceSoFar:\$\('#planResults'\)\.value\.trim\(\)/);
 assert.match(handler,/importedMilestoneStatus\(m,!!\(file\|\|\$\('#planResults'\)\.value\.trim\(\)\)\)/);
 assert.match(handler,/assessmentInputs:\{ventureType:/);
 assert.match(handler,/comparisonBusinessType=\$\('#planBusinessType'\)\.value\|\|inferredBusinessType/);
});
test('Explicit business type takes precedence over ambiguous business descriptions',()=>{
 const section=sourceBetween('function inferredBusinessType(){','/* Responsive planning routes');
 assert.match(section,/Object\.hasOwn\(businessPathDefaults,chosen\)/);
 assert.match(section,/if\(Object\.hasOwn\(businessPathDefaults,chosen\)\)return chosen/);
});

test('Past results can generate an achieved milestone without a file',()=>{
 const handler=sourceBetween("$('#planForm').onsubmit=async",'const ambitionProfiles=');
 assert.match(handler,/!\$\('#planResults'\)\.value\.trim\(\)/);
 const src=sourceBetween('function importedMilestoneStatus(', "$('#planForm').onsubmit=async");
 const status=vm.runInNewContext(src+'\nimportedMilestoneStatus');
 assert.equal(status({title:'Paid field pilot',reported_evidence:'One farm paid £450',evidence_source:'one farm paid £450',evidence_direction:'positive'},true),'Achieved');
 assert.equal(status({title:'Future pilot',reported_evidence:'',evidence_source:'',evidence_direction:'none'},true),'Not started');
});
test('Past results remain founder reports, not independently verified',()=>{
 const handler=sourceBetween("$('#planForm').onsubmit=async",'const ambitionProfiles=');
 assert.match(handler,/evidence_source_type:'founder'/);
});

test('New text-based venture does not inherit identity of a previous saved profile',()=>{
 const src=sourceBetween('function planVentureContext(){','function assessmentContext()');
 const prior={name:'Older venture',description:'Old deep tech R&D startup',ventureType:'Deep tech / Research',stage:'Seed'};
 const newPlan={fromDocument:false,businessDiagnosis:{primary_customer:'Independent farmers'},ventureIdentity:{name:'FieldNote',description:'Farm irrigation software',ventureType:'Software / SaaS',stage:'Prototype'},assessmentInputs:{ventureType:'Software / SaaS',stage:'Testing / Pilot',evidenceSoFar:'One pilot completed'},summary:'Irrigation tool'};
 const result=vm.runInNewContext(src+'\nplanVentureContext()',{
  state:{plan:newPlan},getContext:()=>prior
 });
 assert.equal(result.name,'FieldNote');
 assert.equal(result.ventureType,'Software / SaaS');
 assert.equal(result.stage,'Testing / Pilot');
 assert.equal(result.description,'Farm irrigation software');
 assert.equal(result.evidenceSoFar,'One pilot completed');
});
test('New idea and historical results do not send stale venture profile to assessment',()=>{
 const handler=sourceBetween("$('#planForm').onsubmit=async",'const ambitionProfiles=');
 assert.match(handler,/!file&&!\$\('#ambitions'\)\.value\.trim\(\)&&!\$\('#planResults'\)\.value\.trim\(\)\?getContext\(\):\{\}/);
 assert.match(handler,/ventureIdentity:\{name:data\.venture_name/);
 assert.match(handler,/assessmentInputs:\{ventureType:/);
});

test('Growth-route step count validator enforces chosen maximum',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../api/assess.js'),'utf8');
 const start=api.indexOf('function routeStepCountIssue(');
 const end=api.indexOf('async function generateGrowthRoutes(',start);
 assert.ok(start>=0&&end>start,'Route step count helper exists');
 const check=vm.runInNewContext(api.slice(start,end)+'\nrouteStepCountIssue');
 assert.equal(check({steps:[{}, {}, {}]},3),'');
 assert.equal(check({steps:[{}, {}, {}, {}]},3),'exceeded the selected maximum of 3 milestones');
 assert.equal(check({steps:[{}, {}]},6),'needs at least three distinct milestones');
 assert.equal(check({steps:null},6),'is missing its milestone steps');
});
test('Route response schema constrains max steps dynamically',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../api/assess.js'),'utf8');
 assert.match(api,/steps:\{\.\.\.routeProps\.steps,maxItems:count\}/);
 assert.match(api,/const stepIssue=routeStepCountIssue\(parsedOne\.route,count\)/);
 assert.match(api,/if\(attempt===0\)\{critique=stepIssue;continue\}/);
 assert.match(api,/const stepIssue=routeStepCountIssue\(route,count\)/);
});
test('Growth-route generation retries timeout and incomplete JSON at most once',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../api/assess.js'),'utf8');
 const start=api.indexOf('async function requestOneRoute(');
 const end=api.indexOf('const generated=await Promise.allSettled(',start);
 assert.ok(start>=0&&end>start,'Per-route retry helper present');
 const request=api.slice(start,end);
 assert.match(request,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
 assert.match(request,/if\(timeout&&attempt===0\)/);
 assert.match(request,/if\(attempt===0\)\{critique='The previous response was empty/);
 assert.match(request,/if\(attempt===0\)\{critique='The previous response was incomplete JSON/);
 assert.match(request,/if\(attempt===0\)\{critique='The response did not contain route /);
 assert.match(request,/throw err/);
});

test('Optional venture context appears before auto-starting document upload',()=>{
 const form=sourceBetween('id="planForm"','</form>');
 const type=form.indexOf('id="planBusinessType"');
 const stage=form.indexOf('id="planStage"');
 const results=form.indexOf('id="planResults"');
 const upload=form.indexOf('id="planFile"');
 assert.ok(type>=0&&stage>type&&results>stage&&upload>results,
  'Complete optional business context before selecting a deck, which starts analysis automatically');
 assert.match(form,/or upload a document below/);
 assert.match(form,/id="retryPlanAnalysis" hidden/);
});
test('Moving upload below context keeps its automatic analysis and retry behavior',()=>{
 const change=sourceBetween("$('#planFile').addEventListener('change'", "$('#clearDemo').onclick");
 assert.match(change,/submitSelectedPlanDocument\(\)/);
 assert.match(change,/file\.size>2500000/);
 assert.match(html,/\$\('#retryPlanAnalysis'\)\.onclick=submitSelectedPlanDocument/);
});
