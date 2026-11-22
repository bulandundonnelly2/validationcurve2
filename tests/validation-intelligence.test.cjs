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
 assert.match(html,/p\.status==='In progress'\?'2 7':'9 7'/);
 assert.match(html,/actualPaths\+pendingPaths\+futurePaths\+pointMarkup/);
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
 assert.match(html,/impact\.pendingEvidence\?'\.65'/);
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
