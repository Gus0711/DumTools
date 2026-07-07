/* eslint-disable */
// @ts-nocheck
/* Import de schéma électrique PDF (PDF.js + heuristiques positionnelles).
 * Portage quasi verbatim de l'ancien outil — la partie la plus fragile.
 * Typage interne désactivé (code porté) ; interface publique typée. */
import {
  controllerInfo,
  controllerHasIntegratedPower,
  detectModuleDefinition,
  isCommunicationType,
  isIntegratedControllerType,
  modulePointCode,
  normalizeControllerReference,
  normalizePdfText,
} from "./model";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  _pdfjs = lib;
  return lib;
}

// ===================== BLOC PORTÉ (verbatim) =====================
function pdfAngle(transform){return Math.atan2(transform?.[1]||0,transform?.[0]||1)*180/Math.PI}
function clusterPdfLines(items,tolerance=5){const source=items.filter(i=>Math.abs(i.angle)<18||Math.abs(Math.abs(i.angle)-180)<18).sort((a,b)=>a.top-b.top||a.x-b.x),lines=[];source.forEach(item=>{let line=lines.find(l=>Math.abs(l.top-item.top)<=Math.max(tolerance,item.height*.45));if(!line){line={top:item.top,items:[]};lines.push(line)}line.items.push(item);line.top=line.items.reduce((s,x)=>s+x.top,0)/line.items.length});return lines.map(l=>{l.items.sort((a,b)=>a.x-b.x);l.text=normalizePdfText(l.items.map(i=>i.str).join(' '));l.x=Math.min(...l.items.map(i=>i.x));l.x2=Math.max(...l.items.map(i=>i.x+i.width));l.cx=(l.x+l.x2)/2;return l}).filter(l=>l.text).sort((a,b)=>a.top-b.top||a.x-b.x)}
function inferPdfSignal(label,direction){const up=String(label||'').toUpperCase();if(direction==='output'){if(/\bODM\b|\bKM\w*\b|\bCOMMANDE\b|\bRELAIS\b|\bPOMPE\b|\bMARCHE\b|\bARRET\b/.test(up))return'D';if(/4\s*[-–]\s*20/.test(up))return'4-20mA';return'0-10V'}if(/\bPRESSOSTAT\b|\bDEFAUT\b|\bSEC\b|\bMARCHE\b|\bCONTACT\b|\bDEBIT\b|\bMANQUE\b|\bALARME\b|\bTHERMOSTAT\b/.test(up))return'D';if(/\bSDE\b|\bSONDE\b|\bTP\b|\bTEMP|\bAMB\b/.test(up))return'T';if(/4\s*[-–]\s*20/.test(up))return'4-20mA';return'0-10V'}
function cleanPdfLabel(text){return normalizePdfText(text).replace(/\b(?:UI|UO|DI|DO)\s*\d+\b/gi,' ').replace(/\b(?:COM|M|Y)\b/gi,' ').replace(/\s+/g,' ').replace(/^[\-:;,.\s]+|[\-:;,.\s]+$/g,'').trim()}
function deduplicatePdfLabel(text){
  let tokens=cleanPdfLabel(text).split(/\s+/).filter(Boolean);
  const same=(a,b)=>String(a||'').localeCompare(String(b||''),'fr',{sensitivity:'base'})===0;
  const seqSame=(startA,startB,length)=>{for(let i=0;i<length;i++)if(!same(tokens[startA+i],tokens[startB+i]))return false;return true};
  // Retire les groupes immédiatement répétés : « CLASSE 00 CLASSE 00 ».
  let changed=true;
  while(changed){
    changed=false;
    outer:for(let span=Math.floor(tokens.length/2);span>=1;span--){
      for(let i=0;i+span*2<=tokens.length;i++){
        if(seqSame(i,i+span,span)){tokens.splice(i+span,span);changed=true;break outer}
      }
    }
  }
  // Certains PDF.js placent le complément avant puis après l'ancre :
  // « DEGAGEMENT 00 V2V ZONE N°7 DEGAGEMENT 00 ».
  for(let span=Math.floor(tokens.length/2);span>=1;span--){
    let equal=true;
    for(let i=0;i<span;i++)if(!same(tokens[i],tokens[tokens.length-span+i])){equal=false;break}
    const keywordIndex=tokens.findIndex(t=>/^(?:V2V|V3V|VANNE|ODM)$/i.test(t));
    if(equal&&keywordIndex>=span){tokens=tokens.slice(span);break}
  }
  return tokens.join(' ').replace(/\bN\s*[°ºO]?\s*(\d+)/gi,'N°$1').replace(/\s+/g,' ').trim();
}
function pdfKeywordScore(text,direction){const up=String(text||'').toUpperCase();const rx=direction==='input'?/SDE|SONDE|TEMP|AMB|PRESSOSTAT|DEFAUT|MANQUE|CONTACT|ALARME|HYGRO|CO2|PRESSION|DEBIT|ROSEE|FENETRE|CONDENS/:/V2V|V3V|V6V|VAV|VANNE|ODM|COMMANDE|CDE|POMPE|RELAIS|SIGNAL|MODUL|HUMID|VITESSE|AEROTHERME|SOUFFLAGE|REPRISE/;return (up.match(rx)||[]).length+(up.length>5?1:0)}
function pickRotatedLabels(items,direction){const rot=items.filter(i=>Math.abs(Math.abs(i.angle)-90)<22),groups=[];rot.forEach(i=>{let g=groups.find(x=>Math.abs(x.x-i.x)<18);if(!g){g={x:i.x,items:[]};groups.push(g)}g.items.push(i);g.x=g.items.reduce((s,x)=>s+x.x,0)/g.items.length});return groups.map(g=>{const a=[...g.items].sort((x,y)=>y.y-x.y).map(i=>i.str).join(' '),b=[...g.items].sort((x,y)=>x.y-y.y).map(i=>i.str).join(' ');const ca=cleanPdfLabel(a),cb=cleanPdfLabel(b),label=pdfKeywordScore(ca,direction)>=pdfKeywordScore(cb,direction)?ca:cb;return {x:g.x,label}}).filter(x=>x.label&&pdfKeywordScore(x.label,direction)>0).sort((a,b)=>a.x-b.x)}
function outputZoneLabelsFromItems(items){
  // Les schémas Dumortier placent une désignation par sortie au-dessus du module.
  // PDF.js renvoie souvent tous les textes d'une même hauteur sur une seule ligne :
  // il faut donc découper la ligne en colonnes autour de chaque ancre V2V/V3V.
  const horizontal=items.filter(i=>Math.abs(i.angle)<18||Math.abs(Math.abs(i.angle)-180)<18);
  const anchors=[];
  horizontal.forEach(item=>{
    const text=normalizePdfText(item.str);
    const rx=/\b(?:V2V|V3V)\b/gi;
    let match;
    while((match=rx.exec(text))){
      const ratio=text.length?match.index/text.length:0;
      anchors.push({x:item.x+(item.width||0)*ratio,top:item.top,item,start:match.index});
    }
  });
  if(!anchors.length)return [];

  // Une page peut contenir d'autres mentions V2V plus bas. On conserve la rangée
  // supérieure qui contient le plus d'ancres et correspond aux libellés des UO.
  const rows=[];
  anchors.sort((a,b)=>a.top-b.top||a.x-b.x).forEach(anchor=>{
    let row=rows.find(r=>Math.abs(r.top-anchor.top)<10);
    if(!row){row={top:anchor.top,anchors:[]};rows.push(row)}
    row.anchors.push(anchor);
    row.top=row.anchors.reduce((sum,a)=>sum+a.top,0)/row.anchors.length;
  });
  const selected=[...rows].sort((a,b)=>b.anchors.length-a.anchors.length||a.top-b.top)[0];
  const rowAnchors=selected.anchors.sort((a,b)=>a.x-b.x);
  const forbidden=/\b(?:ECY|ECLYPSE|UO|UI|DI|DO|COM|18V|24V|0V|BORNE|CONNECTION|DUMORTIER|DESSIN[ÉE]?|MODIFI[ÉE]?|FOLIO)\b/i;
  const labels=[];

  rowAnchors.forEach((anchor,index)=>{
    const previous=rowAnchors[index-1],next=rowAnchors[index+1];
    const left=previous?(previous.x+anchor.x)/2:anchor.x-70;
    const right=next?(anchor.x+next.x)/2:anchor.x+105;
    const inColumn=item=>{
      const cx=item.x+(item.width||0)/2;
      return cx>=left&&cx<right;
    };

    // Lorsqu'un seul item PDF.js contient plusieurs libellés V2V, on ne garde
    // que la portion comprise entre l'ancre courante et l'ancre suivante.
    const sourceText=normalizePdfText(anchor.item?.str||'');
    const sameItemAnchors=rowAnchors.filter(a=>a.item===anchor.item).sort((a,b)=>(a.start||0)-(b.start||0));
    const sameIndex=sameItemAnchors.indexOf(anchor);
    const nextSame=sameIndex>=0?sameItemAnchors[sameIndex+1]:null;
    const anchorSegment=sourceText.slice(anchor.start||0,nextSame?nextSame.start:sourceText.length).trim();
    const firstLineParts=[{x:anchor.x,text:anchorSegment},...horizontal
      .filter(item=>item!==anchor.item&&Math.abs(item.top-anchor.top)<9&&inColumn(item))
      .map(item=>({x:item.x,text:item.str}))]
      .sort((a,b)=>a.x-b.x)
      .map(item=>item.text);
    const firstLine=firstLineParts.join(' ');

    const belowLines=clusterPdfLines(horizontal.filter(item=>{
      const dy=item.top-anchor.top;
      return dy>=9&&dy<42&&inColumn(item);
    }),4)
      .filter(line=>!forbidden.test(line.text))
      .filter(line=>!/^(?:[A-Y]|\d+)$/i.test(line.text))
      .sort((a,b)=>a.top-b.top)
      .slice(0,2)
      .map(line=>line.text);

    let label=deduplicatePdfLabel([firstLine,...belowLines].join(' '));
    if(label&&pdfKeywordScore(label,'output')>0){
      labels.push({x:anchor.x,cx:anchor.x,top:anchor.top,label});
    }
  });

  return labels
    .sort((a,b)=>a.x-b.x)
    .filter((entry,index,array)=>index===0||Math.abs(entry.x-array[index-1].x)>12||entry.label!==array[index-1].label);
}
function markerItems(items,kinds){
  const allowed=kinds.map(k=>String(k).toUpperCase());
  const markers=[];
  const add=(kind,channel,x,top)=>{
    kind=String(kind||'').toUpperCase();channel=Number(channel);
    if(!allowed.includes(kind)||!Number.isFinite(channel)||channel<1||channel>32)return;
    if(markers.some(m=>m.kind===kind&&m.channel===channel))return;
    markers.push({kind,channel,x,top});
  };

  // Cas 1 : « UO 1 » est renvoyé dans un seul item PDF.js.
  items.forEach(item=>{
    const text=normalizePdfText(item.str).toUpperCase();
    const rx=new RegExp(`\\b(${allowed.join('|')})\\s*0?(\\d{1,2})\\b`,'g');
    let match;
    while((match=rx.exec(text))){
      const centerRatio=text.length?(match.index+match[0].length/2)/text.length:.5;
      add(match[1],match[2],item.x+(item.width||0)*centerRatio,item.top);
    }
  });

  // Cas 2 : « UO » et « 1 » sont deux items voisins sur la même ligne.
  clusterPdfLines(items,4).forEach(line=>{
    const row=[...line.items].sort((a,b)=>a.x-b.x);
    for(let i=0;i<row.length;i++){
      const kind=normalizePdfText(row[i].str).toUpperCase();
      if(!allowed.includes(kind))continue;
      for(let j=i+1;j<Math.min(row.length,i+4);j++){
        const numberText=normalizePdfText(row[j].str);
        const m=numberText.match(/^0?(\d{1,2})$/);
        if(!m)continue;
        const gap=row[j].x-(row[i].x+(row[i].width||0));
        if(gap>35)break;
        add(kind,m[1],(row[i].x+row[j].x+(row[j].width||0))/2,(row[i].top+row[j].top)/2);
        break;
      }
    }
  });
  return markers.sort((a,b)=>a.channel-b.channel||a.x-b.x);
}
function groupPdfMarkersByRow(markers,tolerance=28){
  const rows=[];
  [...markers].sort((a,b)=>a.top-b.top||a.x-b.x).forEach(marker=>{
    let row=rows.find(r=>Math.abs(r.top-marker.top)<=tolerance);
    if(!row){row={top:marker.top,markers:[]};rows.push(row)}
    row.markers.push(marker);
    row.top=row.markers.reduce((sum,m)=>sum+m.top,0)/row.markers.length;
  });
  rows.forEach(row=>row.markers.sort((a,b)=>a.x-b.x));
  return rows.sort((a,b)=>a.top-b.top);
}
function isPdfOutputNoise(text){
  const value=normalizePdfText(text);
  if(!value)return true;
  if(/^(?:\(?\s*\d+\s*[-–]\s*[A-Z]\s*\)?|P\d+|C\d+|\d+|[A-Z]|NO\s*\d+|NC\s*\d+|C\s*\d+|UO\s*\d+|UI\s*\d+|DI\s*\d+|DO\s*\d+|COM|0V|18V|24V|Y|M)$/i.test(value))return true;
  if(/\b(?:ECY|ECLYPSE|DUMORTIER|DESSIN[ÉE]?|MODIFI[ÉE]?|FOLIO|BORNE|CONNECTION|SRMV\d*|1\s*MM²)\b/i.test(value))return true;
  return false;
}
function associateHorizontalOutputLabels(items,markers,maxChannels){
  const valid=[...markers].filter(m=>m.channel>=1&&m.channel<=maxChannels);
  if(!valid.length)return [];
  const horizontal=items.filter(i=>Math.abs(i.angle)<18||Math.abs(Math.abs(i.angle)-180)<18);
  const rows=groupPdfMarkersByRow(valid);
  const startRx=/\b(?:V2V|V3V|VANNE|ODM|COMMANDE|CDE|POMPE|RELAIS|SIGNAL|MODUL|HUMID)\b/i;
  const result=[];
  rows.forEach((row,rowIndex)=>{
    const above=rows.length===1||rowIndex===0;
    row.markers.forEach((marker,index)=>{
      const previous=row.markers[index-1],next=row.markers[index+1];
      const left=previous?(previous.x+marker.x)/2:marker.x-135;
      const right=next?(marker.x+next.x)/2:marker.x+135;
      const selected=horizontal.filter(item=>{
        const cx=item.x+(item.width||0)/2;
        if(cx<left||cx>=right)return false;
        if(above)return item.top<row.top-12&&item.top>row.top-330;
        return item.top>row.top+18&&item.top<row.top+180;
      });
      const lines=clusterPdfLines(selected,4)
        .filter(line=>!isPdfOutputNoise(line.text))
        .sort((a,b)=>a.top-b.top);
      let start=lines.findIndex(line=>startRx.test(line.text));
      if(start<0)return;
      const firstTop=lines[start].top;
      const picked=[];
      for(let i=start;i<lines.length&&picked.length<5;i++){
        const line=lines[i];
        if(Math.abs(line.top-firstTop)>55)break;
        if(isPdfOutputNoise(line.text))continue;
        picked.push(line.text);
      }
      const label=deduplicatePdfLabel(picked.join(' '));
      if(label&&pdfKeywordScore(label,'output')>0)result.push({channel:marker.channel,label});
    });
  });
  return result.sort((a,b)=>a.channel-b.channel);
}
function associate16DiLabels(items,markers,maxChannels){
  const valid=[...markers].filter(m=>m.channel>=1&&m.channel<=maxChannels);
  if(!valid.length)return [];
  const rows=groupPdfMarkersByRow(valid);
  const rotated=items.filter(i=>Math.abs(Math.abs(i.angle)-90)<22);
  const allowed=/DEFAUT|MANQUE|PRESSOSTAT|ALARME|SONDE|SDE|TEMP|EAU\s+GLACEE|CHAUFFAGE|CIRCUIT|RADIATEUR|POUTRE|CTA|PAC|DESEMBOUEUR|SYNTHESE/i;
  const assigned=new Map();
  rotated.forEach(item=>{
    const label=cleanPdfLabel(item.str);
    if(!label||!allowed.test(label)||/SIEMENS|SAS61|MM²/i.test(label))return;
    let best=null,bestDistance=Infinity;
    rows.forEach((row,rowIndex)=>{
      const above=rowIndex===0;
      const outward=above?item.top<row.top-12:item.top>row.top+12;
      if(!outward)return;
      if(above&&item.top<row.top-220)return;
      if(!above&&item.top>row.top+230)return;
      row.markers.forEach(marker=>{
        const distance=Math.abs(item.x-marker.x);
        if(distance<bestDistance&&distance<=52){best=marker;bestDistance=distance}
      });
    });
    if(!best)return;
    if(!assigned.has(best.channel))assigned.set(best.channel,[]);
    assigned.get(best.channel).push(item);
  });
  const result=[];
  valid.sort((a,b)=>a.channel-b.channel).forEach(marker=>{
    const parts=assigned.get(marker.channel)||[];
    if(!parts.length)return;
    parts.sort((a,b)=>a.x-b.x||a.top-b.top);
    const label=deduplicatePdfLabel(parts.map(item=>item.str).join(' '));
    if(label)result.push({channel:marker.channel,label});
  });
  return result;
}
function mergePdfChannelLabels(primary,fallback,maxChannels){
  const map=new Map();
  [...primary,...fallback].forEach(entry=>{
    const channel=Number(entry.channel);
    if(channel>=1&&channel<=maxChannels&&!map.has(channel)&&entry.label)map.set(channel,{channel,label:entry.label});
  });
  return [...map.values()].sort((a,b)=>a.channel-b.channel);
}

function associateOutputPdfLabels(markers,labels,maxChannels){
  const orderedLabels=[...labels].sort((a,b)=>(a.x??a.cx)-(b.x??b.cx)).slice(0,maxChannels);
  if(!orderedLabels.length)return [];
  const orderedMarkers=[...markers].filter(m=>m.channel>=1&&m.channel<=maxChannels).sort((a,b)=>a.x-b.x||a.channel-b.channel);
  // Sur les folios Dumortier, les désignations et les UO sont ordonnées de gauche à droite.
  // Lorsque PDF.js ne sépare pas les marqueurs UO, on retombe sur 1, 2, 3…
  return orderedLabels.map((label,index)=>({
    channel:orderedMarkers[index]?.channel||index+1,
    label:label.label
  })).filter(point=>point.channel<=maxChannels);
}
function horizontalCandidates(lines,direction){const keyword=direction==='input'?/SDE|SONDE|TEMP|AMB|PRESSOSTAT|DEFAUT|MANQUE|CONTACT|ALARME|HYGRO|CO2|PRESSION|DEBIT|ROSEE|FENETRE|CONDENS/:/V2V|V3V|V6V|VAV|VANNE|ODM|COMMANDE|CDE|POMPE|RELAIS|SIGNAL|MODUL|HUMID|VITESSE|AEROTHERME|SOUFFLAGE|REPRISE/;return lines.filter(l=>keyword.test(l.text.toUpperCase())&&!/ECY\s*[-_]/i.test(l.text)&&!/^(UI|UO|DI|DO)\s*\d+$/i.test(l.text)).map(l=>({...l,label:cleanPdfLabel(l.text)})).filter(l=>l.label)}
function associatePdfLabels(markers,labels,maxChannels){const used=new Set(),out=[];markers.sort((a,b)=>a.channel-b.channel).forEach(m=>{let best=-1,bestScore=Infinity;labels.forEach((l,i)=>{if(used.has(i))return;const dx=Math.abs((l.cx??l.x)-m.x),dy=Math.abs((l.top??m.top)-m.top),score=dx+dy*.7;if(dx<170&&dy<140&&score<bestScore){best=i;bestScore=score}});if(best>=0){used.add(best);out.push({channel:m.channel,label:labels[best].label})}});if(!out.length)labels.slice(0,maxChannels).forEach((l,i)=>out.push({channel:i+1,label:l.label}));return out.filter(x=>x.channel>=1&&x.channel<=maxChannels)}
function extractPdfModulePage(items,pageNumber,pageHeight){
  const lines=clusterPdfLines(items);
  const allText=normalizePdfText(lines.map(l=>l.text).join(' ')+' '+items.map(i=>i.str).join(' '));
  const moduleMatch=allText.match(/ECY\s*[-_]?\s*(8UI6UO|4UI4UO|8UI|16DI|8DOR|RS485|M\s*[-_]?\s*BUS)\s*(?:N\s*[°ºO]?\s*)?(\d+)?/i);
  if(!moduleMatch)return null;
  const type=moduleMatch[1].toUpperCase().replace(/[\s_-]/g,'');
  const communication=isCommunicationType(type);
  const instance=communication?'':(moduleMatch[2]||'');
  if(communication)return{page:pageNumber,type,instance:'',inputs:[],outputs:[],communication:true,textCount:items.length,pageHeight};
  const def=detectModuleDefinition(1,type,'');
  const inputMarkers=markerItems(items,[def.inputKind||'UI',type==='16DI'?'DI':'UI']);
  const outputMarkerKinds=type==='8DOR'?['DO','NO']:[def.outputKind||'UO','UO'];
  const outputMarkers=markerItems(items,outputMarkerKinds);
  let inputLabels=pickRotatedLabels(items,'input');if(!inputLabels.length)inputLabels=horizontalCandidates(lines,'input');
  let outputLabels=outputZoneLabelsFromItems(items);if(!outputLabels.length)outputLabels=horizontalCandidates(lines,'output');
  const inputs=type==='16DI'?associate16DiLabels(items,inputMarkers,def.inputCount):associatePdfLabels(inputMarkers,inputLabels,def.inputCount);
  const geometryOutputs=associateHorizontalOutputLabels(items,outputMarkers,def.outputCount);
  const fallbackOutputs=associateOutputPdfLabels(outputMarkers,outputLabels,def.outputCount);
  const outputs=mergePdfChannelLabels(geometryOutputs,fallbackOutputs,def.outputCount);
  return{page:pageNumber,type,instance,inputs,outputs,communication:false,textCount:items.length,pageHeight};
}
const INTEGRATED_PDF_CONTROLLERS={
  'ECY-PTU-207':{type:'ECY-PTU-207',inputCount:6,outputCount:10,inputKinds:['UI','SI','DI'],outputKinds:['DO','AO'],inputCodes:['UI1','UI2','UI3','SI4','DI5','DI6'],outputCodes:['DO1','DO2','DO3','DO4','DO5','DO6','AO7','AO8','AO9','AO10']},
  'ECY-300':{type:'ECY-300',inputCount:10,outputCount:8,inputKinds:['UI','DI','SI'],outputKinds:['UO','AO','DO','DUO']},
  'ECY-303':{type:'ECY-303',inputCount:8,outputCount:8,inputKinds:['UI','DI','SI'],outputKinds:['DO','DUO','UO','AO'],inputCodes:['UI1','UI2','UI3','UI4','UI5','UI6','UI7','UI8'],outputCodes:['DO1','DO2','DO3','DO4','DUO5','DUO6','UO7','UO8']},
  'ECY-400':{type:'ECY-400',inputCount:12,outputCount:12,inputKinds:['UI','DI','SI'],outputKinds:['UO','AO','DO','DUO']},
  'ECY-450':{type:'ECY-450',inputCount:12,outputCount:12,inputKinds:['UI','DI','SI'],outputKinds:['UO','AO','DO','DUO']},
  'ECY-600':{type:'ECY-600',inputCount:16,outputCount:14,inputKinds:['UI','DI','SI'],outputKinds:['UO','AO','DO','DUO']},
  'ECY-650':{type:'ECY-650',inputCount:16,outputCount:14,inputKinds:['UI','DI','SI'],outputKinds:['UO','AO','DO','DUO']}
};
function normalizeIntegratedMarkerChannel(kind,channel,definition){
  kind=String(kind||'').toUpperCase();channel=Number(channel);
  if(definition.type==='ECY-PTU-207'){
    if(kind==='SI')return 4;
    return channel;
  }
  return channel;
}
function integratedMarkers(items,kinds,definition){
  const raw=markerItems(items,kinds);
  const map=new Map();
  raw.forEach(marker=>{
    const channel=normalizeIntegratedMarkerChannel(marker.kind,marker.channel,definition);
    if(channel<1)return;
    const key=channel;
    if(!map.has(key))map.set(key,{...marker,channel});
  });
  return [...map.values()].sort((a,b)=>a.channel-b.channel||a.x-b.x);
}
function integratedPointCode(definition,direction,channel){
  const list=direction==='input'?definition.inputCodes:definition.outputCodes;
  if(Array.isArray(list)&&list[channel-1])return list[channel-1];
  return `${direction==='input'?'UI':'UO'}${channel}`;
}
function integratedLabelCandidates(items,lines,direction){
  const rotated=pickRotatedLabels(items,direction);
  const horizontal=horizontalCandidates(lines,direction);
  const merged=[...rotated,...horizontal];
  return merged.filter((entry,index,array)=>array.findIndex(other=>Math.abs((other.x??other.cx)-(entry.x??entry.cx))<8&&other.label===entry.label)===index);
}
function cleanIntegratedPdfLabel(text){
  let value=normalizePdfText(text)
    .replace(/\bCABLE\s+\d+\s*[xX]\s*[\d.,]+\s*mm²?/gi,' ')
    .replace(/\bFil\s*\d+\s*:\s*/gi,' ')
    .replace(/\b(?:RENVOIE|RENVOI)\s*\d+\b/gi,' ')
    .replace(/\b(?:0V|18V|24V|230V|VREF|COM|RESERVE)\b/gi,' ')
    .replace(/\bSignal\s*0\s*[-–]\s*10V\b/gi,' ')
    .replace(/\s+/g,' ').trim();
  return deduplicatePdfLabel(value);
}
function uniqueIntegratedLabels(entries){
  return entries.filter(entry=>entry.label).filter((entry,index,array)=>array.findIndex(other=>other.label.localeCompare(entry.label,'fr',{sensitivity:'base'})===0&&Math.abs((other.x??0)-(entry.x??0))<18)===index);
}

function isPdfFolioReference(text){return /^\(\s*\d{2}\s*-\s*[A-Q]\s*\)$/i.test(normalizePdfText(text))}
function assignNearestMarkerLabels(markers,entries,maxDistance=100,mergeLabels=true){
  const map=new Map();
  (entries||[]).forEach(entry=>{
    const x=Number(entry?.x??entry?.cx);
    const label=cleanIntegratedPdfLabel(entry?.label||entry?.text||'');
    if(!Number.isFinite(x)||!label)return;
    let best=null;
    (markers||[]).forEach(marker=>{
      const d=Math.abs((marker.x??0)-x);
      if(!best||d<best.d)best={marker,d};
    });
    if(!best||best.d>maxDistance)return;
    const channel=Number(best.marker.channel);
    if(!channel)return;
    const current=map.get(channel);
    if(current&&mergeLabels!==false)current.label=deduplicatePdfLabel(`${current.label} / ${label}`);
    else if(!current)map.set(channel,{channel,label});
  });
  return [...map.values()].sort((a,b)=>a.channel-b.channel);
}
function assignNearestMarkerFolioRefs(markers,entries,maxDistance=85){
  const map=new Map();
  (entries||[]).forEach(entry=>{
    const x=Number(entry?.x??entry?.cx),folioRef=String(entry?.folioRef||'').replace(/\s+/g,'');
    if(!Number.isFinite(x)||!folioRef)return;
    let best=null;
    (markers||[]).forEach(marker=>{
      const d=Math.abs((marker.x??0)-x);
      if(!best||d<best.d)best={marker,d};
    });
    if(!best||best.d>maxDistance)return;
    const channel=Number(best.marker.channel);
    if(!channel||map.has(channel))return;
    map.set(channel,{channel,label:`Vers folio ${folioRef.replace(/[()]/g,'')}`,folioRef});
  });
  return [...map.values()].sort((a,b)=>a.channel-b.channel);
}
function ptuVerticalInputEntries(items,inputTop){
  return (items||[])
    .filter(item=>Math.abs(Math.abs(item.angle)-90)<22&&item.top<inputTop-10&&item.top>inputTop-270)
    .map(item=>({x:item.x,top:item.top,label:cleanIntegratedPdfLabel(item.str)}))
    .filter(entry=>entry.label)
    .filter(entry=>!/^(?:HOST|SUBNET|INPUTS?|OUTPUTS?|UI\d+|DI\d+|SI\d+|VREF|COM|N|L|MA\d+|SD|ME|DEF\d+|ECY|PTU|ECLYPSE|DISTECH)$/i.test(entry.label))
    .filter(entry=>!/(?:DUMORTIER|COPAXSO|REGULATION|DESSIN|MODIFI|PAR|FOLIO)/i.test(entry.label));
}
function ptuBottomOutputEntries(lines,outputTop){
  return (lines||[])
    .filter(line=>line.top>outputTop+42&&line.top<outputTop+300)
    .map(line=>({...line,label:cleanIntegratedPdfLabel(line.text)}))
    .filter(line=>line.label)
    .filter(line=>!isPdfFolioReference(line.label))
    .filter(line=>!/^(?:NO|NC|N|L|COM|MA\d+|SD|UI\d+|DI\d+|SI\d+|AO\d+|DO\d+|VREF|230V|24V|18V|\d+)$/.test(line.label))
    .filter(line=>!/(?:DUMORTIER|COPAXSO|REGULATION|DESSIN|MODIFI|PAR|ROUGE|BLEU|BLANC|MARRON|NOIR|VIOLET|ECY|PTU|DISTECH|HOST|SUBNET)/i.test(line.label));
}
function ptuOutputFolioEntries(items,outputTop){
  return (items||[])
    .filter(item=>item.top>outputTop+8&&item.top<outputTop+150&&isPdfFolioReference(item.str))
    .map(item=>({x:item.x,top:item.top,folioRef:normalizePdfText(item.str).replace(/\s+/g,'')}));
}
function ptuInputOutputPoints(items,inputMarkers,outputMarkers,lines=[]){
  const inputTop=inputMarkers.length?Math.min(...inputMarkers.map(m=>m.top)):300;
  const outputTop=outputMarkers.length?Math.max(...outputMarkers.map(m=>m.top)):320;

  // Heuristique locale : on s'appuie d'abord sur les libellés verticaux du folio.
  const directInputs=assignNearestMarkerLabels(inputMarkers,ptuVerticalInputEntries(items,inputTop),118,true);
  const directOutputs=assignNearestMarkerLabels(outputMarkers,ptuBottomOutputEntries(lines,outputTop).map(line=>({x:line.cx??line.x,label:line.label})),118,true);
  const folioOutputs=assignNearestMarkerFolioRefs(outputMarkers,ptuOutputFolioEntries(items,outputTop),88);

  // Heuristiques historiques conservées pour d'autres plans PTU-207.
  const inputs=[],outputs=[];
  const usedInput=new Set(),usedOutput=new Set();
  const rotatedAbove=items.filter(item=>Math.abs(Math.abs(item.angle)-90)<22&&item.top<inputTop+8&&item.top>inputTop-210)
    .map(item=>({x:item.x,top:item.top,raw:normalizePdfText(item.str)}));
  let dewIndex=0;
  rotatedAbove.sort((a,b)=>a.x-b.x).forEach(entry=>{
    const up=entry.raw.toUpperCase();
    let channel=0,label='';
    if(/OUVERTURE\s+FENETR/.test(up)){channel=1;label='Défaut ouverture fenêtres'}
    else if(/POINT\s+DE\s+ROS|POINT\s+DE\s+ROSE/.test(up)){
      channel=[5,6][dewIndex++]||6;
      const fil=entry.raw.match(/Fil\s*(\d+)/i)?.[1];
      label=/CAPTEUR/i.test(entry.raw)?'Capteur de point de rosée':`Contact point de rosée${fil?` ${fil==='5'?'1':fil==='6'?'2':fil}`:''}`;
    }
    if(channel&&!usedInput.has(channel)){usedInput.add(channel);inputs.push({channel,label})}
  });

  const below=items.filter(item=>item.top>outputTop+12&&item.top<outputTop+230);
  const analogHeads=below.filter(item=>/^(?:V6V|VAV)(?:\s|$)/i.test(normalizePdfText(item.str)))
    .map(item=>({x:item.x,top:item.top,head:normalizePdfText(item.str)})).sort((a,b)=>a.x-b.x);
  const analog=[];
  analogHeads.forEach(head=>{
    const complements=below.filter(item=>item!==head&&Math.abs(item.x-head.x)<42&&item.top>=head.top-5&&item.top<head.top+22)
      .filter(item=>!/^(?:\d+|Y\d+|V6V|VAV)$/i.test(normalizePdfText(item.str)))
      .filter(item=>!/(?:DUMORTIER|DESSIN|MODIFI|FOLIO|ZAC\s+LE\s+CH[ÂA]TEAU)/i.test(normalizePdfText(item.str)))
      .sort((a,b)=>a.top-b.top).map(item=>normalizePdfText(item.str));
    let label=cleanIntegratedPdfLabel([head.head,...complements].join(' '));
    if(label&&!analog.some(x=>Math.abs(x.x-head.x)<16&&x.label===label))analog.push({x:head.x,label});
  });
  analog.sort((a,b)=>a.x-b.x).slice(0,4).forEach((entry,index)=>{
    const channel=7+index;if(!usedOutput.has(channel)){usedOutput.add(channel);outputs.push({channel,label:entry.label})}
  });

  const speedStarts=below.filter(item=>/^(?:Petite|Moyenne|Grande)$/i.test(normalizePdfText(item.str))).sort((a,b)=>a.x-b.x);
  speedStarts.forEach((head,index)=>{
    const parts=below.filter(item=>Math.abs(item.x-head.x)<28&&item.top>=head.top-3&&item.top<head.top+30)
      .sort((a,b)=>a.top-b.top).map(item=>normalizePdfText(item.str));
    const label=cleanIntegratedPdfLabel(parts.join(' '));
    const channel=index+1;if(label&&!usedOutput.has(channel)){usedOutput.add(channel);outputs.push({channel,label})}
  });

  return {
    inputs:mergeIntegratedPointLists(directInputs,inputs,6),
    outputs:mergeIntegratedPointLists(mergeIntegratedPointLists(directOutputs,outputs,10),folioOutputs,10)
  };
}
function controllerZoneGroups(items,outputMarkers){
  if(!outputMarkers.length)return [];
  const rowTop=Math.min(...outputMarkers.map(m=>m.top));
  const candidates=items.filter(item=>Math.abs(Math.abs(item.angle)-90)<22&&item.top<rowTop-20&&item.top>rowTop-300)
    .map(item=>({x:item.x,text:normalizePdfText(item.str)}))
    .filter(item=>/^(?:ZONE\b|BD\s*[23]\b)/i.test(item.text));
  const groups=[];
  candidates.sort((a,b)=>a.x-b.x).forEach(item=>{
    let group=groups.find(g=>Math.abs(g.x-item.x)<38);
    if(!group){group={x:item.x,parts:[]};groups.push(group)}
    group.parts.push(item.text);group.x=group.parts.length===1?item.x:(group.x+item.x)/2;
  });
  return groups.map(group=>{
    const zone=group.parts.find(x=>/^ZONE\b/i.test(x))||'';
    const box=group.parts.find(x=>/^BD\s*[23]\b/i.test(x))||'';
    return {x:group.x,label:normalizePdfText([zone,box].filter(Boolean).join(' '))};
  }).filter(g=>g.label).sort((a,b)=>a.x-b.x);
}
function ecy303ClassicControllerPoints(items,lines,inputMarkers,outputMarkers){
  const allText=normalizePdfText((lines||[]).map(line=>line.text).join(' ')+' '+(items||[]).map(item=>item.str).join(' ')).toUpperCase();
  const isClassic=/CDE\s+PPES\s+CR/.test(allText)&&/CDE\s+PPES\s+CTA/.test(allText)&&/V3V\s+CIRCUIT\s+REGULE/.test(allText);
  if(!isClassic)return null;

  // Les huit entrées du ECY-303 sont disposées en bas du dessin. Les libellés
  // sont écrits verticalement et doivent être associés selon leur position réelle.
  const inputLabels=(items||[])
    .filter(item=>Math.abs(Math.abs(item.angle)-90)<22)
    .map(item=>({x:item.x,top:item.top,label:cleanIntegratedPdfLabel(item.str)}))
    .filter(item=>/^(?:SDE|DEF)/i.test(item.label))
    .filter(item=>!/(?:ECRAN|DISTECH|ECY)/i.test(item.label));
  const inputs=assignNearestMarkerLabels(inputMarkers,inputLabels,52,false);

  // Sur ce modèle, les sorties câblées du folio sont :
  // DO1 = commande pompes CR, DO2 = commande pompes CTA, DUO5 = V3V circuit régulé.
  // Les autres sorties restent libres si aucun autre libellé explicite n'est présent.
  const outputs=[];
  const available=new Set((outputMarkers||[]).map(marker=>Number(marker.channel)));
  if(available.has(1))outputs.push({channel:1,label:'CDE PPES CR'});
  if(available.has(2))outputs.push({channel:2,label:'CDE PPES CTA'});
  if(available.has(5))outputs.push({channel:5,label:'V3V CIRCUIT REGULE'});

  return {inputs,outputs};
}

function ecy400ClassicControllerPoints(items,lines,inputMarkers,outputMarkers){
  const allText=normalizePdfText((lines||[]).map(line=>line.text).join(' ')+' '+(items||[]).map(item=>item.str).join(' ')).toUpperCase();
  const isClassic=/COMPTEUR\s*GAZ/.test(allText)
    &&/V3V\s*CR1\s*SANEF/.test(allText)
    &&/V3V\s*CR2\s*GENDAR(?:MERIE)?/.test(allText)
    &&/CDE\s*PPES\s*CR1\s*SANEF/.test(allText)
    &&/CDE\s*PPES\s*CR2\s*GENDAR(?:MERIE)?/.test(allText);
  if(!isClassic)return null;

  // Les 12 entrées du ECY-400 sont câblées en bas du dessin. Les désignations
  // apparaissent verticalement sur le folio ; on les affecte selon leur position.
  const inputLabels=(items||[])
    .filter(item=>Math.abs(Math.abs(item.angle)-90)<22)
    .map(item=>({x:item.x,top:item.top,label:cleanIntegratedPdfLabel(item.str)}))
    .filter(item=>/^(?:SDE|DEF|COMPTEUR|GAZ)/i.test(item.label))
    .filter(item=>!/(?:ECRAN|DISTECH|ECY|HOST|SUBNET|ETHERNET|POWER|STATUS|RS-485|RX|TX)/i.test(item.label));
  let inputs=assignNearestMarkerLabels(inputMarkers,inputLabels,58,true);

  // Corrige la borne UI11 lorsque "Compteur" et "GAZ" sont extraits séparément.
  const availableInput=new Set((inputMarkers||[]).map(marker=>Number(marker.channel)));
  if(availableInput.has(11)){
    const hasGaz=inputs.some(point=>point.channel===11&&/GAZ/i.test(point.label));
    if(!hasGaz&&/COMPTEUR\s*GAZ/.test(allText))inputs=mergeIntegratedPointLists(inputs,[{channel:11,label:'Compteur GAZ'}],12);
  }

  // Sur ce folio ECY-400, les sorties réellement câblées sont fixes et identifiables.
  const outputs=[];
  const availableOutput=new Set((outputMarkers||[]).map(marker=>Number(marker.channel)));
  if(availableOutput.has(1))outputs.push({channel:1,label:'0-10V Chaudières'});
  if(availableOutput.has(2))outputs.push({channel:2,label:'CDE PPES CR1 SANEF'});
  if(availableOutput.has(3))outputs.push({channel:3,label:'CDE PPES CR2 GENDARMERIE'});
  if(availableOutput.has(4))outputs.push({channel:4,label:'V3V CR1 SANEF'});
  if(availableOutput.has(5))outputs.push({channel:5,label:'V3V CR2 GENDARMERIE'});

  return {inputs,outputs};
}

function ecy600ClassicControllerPoints(items,lines,inputMarkers,outputMarkers){
  const allText=normalizePdfText((lines||[]).map(line=>line.text).join(' ')+' '+(items||[]).map(item=>item.str).join(' ')).toUpperCase();

  // Schéma ECY-600 réparti sur deux folios :
  // - ECY-600-1 : UI1 à UI6 et UO1 à UO6
  // - ECY-600-2 : UI7 à UI16 et UO7 à UO12
  // La lecture PDF peut confondre les libellés verticaux des UI avec UO10/UO11/UO12.
  // Ces deux dispositions sont donc reconnues explicitement.
  const isPart1=/ECY\s*[- ]?600\s*[- ]?1/.test(allText)
    ||(/V3V\s*CR1/.test(allText)&&/V3V\s*CR4/.test(allText)&&/CDE\s*PPES\s*CR1\s*80\s*KW/.test(allText));
  const isPart2=/ECY\s*[- ]?600\s*[- ]?2/.test(allText)
    ||(/DEF\s*MANQUE\s*GAZ/.test(allText)&&/DEF\s*PPE\s*2\s*CR4/.test(allText)&&/0\s*[-–]\s*10\s*V\s*CHAUDI[EÈÉ]RES?/.test(allText));

  if(isPart1){
    return {
      inputs:[
        {channel:1,label:'T°Extérieure'},
        {channel:2,label:'T°Dep CR1 80kW'},
        {channel:3,label:'T°Dep CR2 70kW'},
        {channel:4,label:'T°Dep CR3 40kW'},
        {channel:5,label:'T°Dep CR4 20kW'},
        {channel:6,label:'Def Manque Eau'}
      ],
      outputs:[
        {channel:1,label:'V3V CR1'},
        {channel:2,label:'V3V CR2'},
        {channel:3,label:'V3V CR3'},
        {channel:4,label:'V3V CR4'},
        {channel:5,label:'CDE PPES CR1 80kW'},
        {channel:6,label:'CDE PPES CR2 70kW'}
      ]
    };
  }

  if(isPart2){
    return {
      inputs:[
        {channel:7,label:'DEF Manque Gaz'},
        {channel:8,label:'DEF Ppe 1 CR1'},
        {channel:9,label:'DEF Ppe 2 CR1'},
        {channel:10,label:'DEF Ppe 1 CR2'},
        {channel:11,label:'DEF Ppe 2 CR2'},
        {channel:12,label:'DEF Ppe 1 CR3'},
        {channel:13,label:'DEF Ppe 2 CR3'},
        {channel:14,label:'DEF Ppe 1 CR4'},
        {channel:15,label:'DEF Ppe 2 CR4'},
        {channel:16,label:'DEF Chaudières'}
      ],
      outputs:[
        {channel:7,label:'CDE PPES CR3 40kW'},
        {channel:8,label:'CDE PPES CR4 20kW'},
        {channel:9,label:'0-10V Chaudières'}
      ]
    };
  }

  // Autres plans ECY-600 : on conserve l'analyse géométrique générale,
  // mais les défauts restent exclusivement du côté des entrées.
  const base=zoneControllerPoints(items,inputMarkers,outputMarkers);
  if(!base)return null;
  const outputs=(base.outputs||[])
    .filter(point=>Number(point.channel)>=1&&Number(point.channel)<=9)
    .filter(point=>!/^DEF(?:AUT)?|DEF\s+PPE|DEF\s+CHAUDI/i.test(cleanIntegratedPdfLabel(point.label)))
    .map(point=>({...point,label:cleanIntegratedPdfLabel(point.label)}));
  return {inputs:(base.inputs||[]).filter(point=>point.label),outputs:mergeIntegratedPointLists(outputs,[],14)};
}

function zoneControllerPoints(items,inputMarkers,outputMarkers){
  const groups=controllerZoneGroups(items,outputMarkers);
  if(!groups.length)return null;
  const sortedInputs=[...inputMarkers].sort((a,b)=>a.channel-b.channel);
  const sortedOutputs=[...outputMarkers].sort((a,b)=>a.channel-b.channel);
  const inputs=[],outputs=[];
  groups.forEach((group,index)=>{
    const marker=sortedInputs[index];
    if(marker)inputs.push({channel:marker.channel,label:`Défaut condens ${group.label}`});
    const outA=sortedOutputs[index*2],outB=sortedOutputs[index*2+1];
    if(outA)outputs.push({channel:outA.channel,label:`V6V ${group.label}`});
    if(outB)outputs.push({channel:outB.channel,label:`VAV soufflage ${group.label}`});
  });
  const hasWindow=items.some(item=>/OUVERTURE\s+FENETR/i.test(normalizePdfText(item.str)));
  if(hasWindow){const marker=sortedInputs[groups.length];if(marker)inputs.push({channel:marker.channel,label:'Défaut ouverture fenêtres'})}
  return {inputs,outputs};
}
function mergeIntegratedPointLists(primary,secondary,maxChannels){
  const map=new Map();
  [...(primary||[]),...(secondary||[])].forEach(point=>{
    const channel=Number(point?.channel);
    const folioRef=String(point?.folioRef||'').replace(/\s+/g,'');
    let label=cleanIntegratedPdfLabel(point?.label||'');
    if(!label&&folioRef)label=`Vers folio ${folioRef.replace(/[()]/g,'')}`;
    if(channel<1||channel>maxChannels||(!label&&!folioRef))return;
    if(!map.has(channel)){map.set(channel,{channel,label,folioRef});return}
    const current=map.get(channel);
    if((!current.label||/^Vers folio /i.test(current.label))&&label)current.label=label;
    if(!current.folioRef&&folioRef)current.folioRef=folioRef;
  });
  return [...map.values()].sort((a,b)=>a.channel-b.channel);
}
function ptuGenericInputOutputPoints(items,lines,inputMarkers,outputMarkers,definition){
  const rotatedInputs=uniqueIntegratedLabels(pickRotatedLabels(items,'input')
    .map(entry=>({...entry,label:cleanIntegratedPdfLabel(entry.label)})))
    .sort((a,b)=>(a.x??0)-(b.x??0));
  const sensors=rotatedInputs.filter(entry=>/\b(?:SDE|SONDE|TEMP|T°|EXTERIEUR|BALLON|CIRCUIT)\b/i.test(entry.label));
  const alarms=rotatedInputs.filter(entry=>/\b(?:DEFAUT|MANQUE|PPE|POMPE|CONTACT|ROSEE|FENETRE|CONDENS)\b/i.test(entry.label));
  const inputs=[];
  const availableInputChannels=new Set(inputMarkers.map(marker=>marker.channel));
  [1,2,3].forEach((channel,index)=>{
    const item=sensors[index];
    if(item&&availableInputChannels.has(channel))inputs.push({channel,label:item.label});
  });
  const digitalChannels=[4,5,6].filter(channel=>availableInputChannels.has(channel));
  if(alarms.length){
    digitalChannels.forEach((channel,index)=>{
      if(index>=alarms.length)return;
      // Lorsqu'il y a davantage de défauts que d'entrées disponibles, le dernier
      // point reprend la synthèse des libellés restants au lieu de les perdre.
      const values=index===digitalChannels.length-1?alarms.slice(index):[alarms[index]];
      const label=deduplicatePdfLabel(values.map(value=>value.label).join(' / '));
      if(label)inputs.push({channel,label});
    });
  }
  if(!inputs.length){
    const genericInputs=uniqueIntegratedLabels(integratedLabelCandidates(items,lines,'input')
      .map(entry=>({...entry,label:cleanIntegratedPdfLabel(entry.label)})));
    inputs.push(...associatePdfLabels(inputMarkers,genericInputs,definition.inputCount));
  }

  const outputRowTop=outputMarkers.length?Math.min(...outputMarkers.map(marker=>marker.top)):0;
  const localOutputLabels=uniqueIntegratedLabels(horizontalCandidates(lines,'output')
    .filter(entry=>!outputRowTop||entry.top>outputRowTop+18)
    .filter(entry=>!outputRowTop||entry.top<outputRowTop+245)
    .map(entry=>({...entry,label:cleanIntegratedPdfLabel(entry.label)})));
  const associatedOutputs=associatePdfLabels(outputMarkers,localOutputLabels,definition.outputCount);
  const geometricOutputs=associateHorizontalOutputLabels(items,outputMarkers,definition.outputCount);
  const outputs=mergePdfChannelLabels(geometricOutputs,associatedOutputs,definition.outputCount);
  return {inputs,outputs};
}
function ptuClassicControllerPoints(items,lines){
  const sensors=(items||[])
    .filter(item=>Math.abs(Math.abs(item.angle)-90)<22&&/^SDE\s*T/i.test(normalizePdfText(item.str)))
    .map(item=>({x:item.x,label:cleanIntegratedPdfLabel(item.str)}))
    .filter(item=>item.label).sort((a,b)=>a.x-b.x);
  const outputHeads=(items||[])
    .filter(item=>item.top>500&&item.top<565&&/^(?:ODM\s+Ppes|Synth[eèé]se)$/i.test(normalizePdfText(item.str)))
    .sort((a,b)=>a.x-b.x);
  if(sensors.length<3||outputHeads.length<3)return null;

  const inputs=sensors.slice(0,3).map((item,index)=>({channel:index+1,label:item.label}));
  const faults=(items||[])
    .filter(item=>Math.abs(Math.abs(item.angle)-90)<22&&/^D[eé]faut\b/i.test(normalizePdfText(item.str)))
    .map(item=>cleanIntegratedPdfLabel(item.str)).filter(Boolean);
  const water=faults.find(label=>/Manque\s+Eau/i.test(label));
  if(water)inputs.push({channel:5,label:water});
  const pumpFaults=faults.filter(label=>/Ppes|Pompes/i.test(label));
  if(pumpFaults.length)inputs.push({channel:6,label:deduplicatePdfLabel(pumpFaults.join(' / '))});

  const outputs=[];
  outputHeads.slice(0,3).forEach((head,index)=>{
    const parts=(items||[])
      .filter(item=>item.top>=head.top-3&&item.top<head.top+18&&Math.abs(item.x-head.x)<52)
      .sort((a,b)=>a.top-b.top||a.x-b.x)
      .map(item=>normalizePdfText(item.str))
      .filter(value=>!/^(?:230V|NO|NC|\d+)$/i.test(value));
    const label=cleanIntegratedPdfLabel(parts.join(' '));
    if(label)outputs.push({channel:index+1,label});
  });
  const ref=(items||[]).filter(item=>item.top>400&&item.top<470&&item.x<220&&/^\(\s*\d{2}\s*-\s*J\s*\)$/i.test(normalizePdfText(item.str))).sort((a,b)=>a.x-b.x)[0];
  if(ref)outputs.push({channel:7,label:`Vers folio ${normalizePdfText(ref.str).replace(/[()\s]/g,'')}`,folioRef:normalizePdfText(ref.str).replace(/\s+/g,'')});
  return {inputs:inputs.sort((a,b)=>a.channel-b.channel),outputs:outputs.sort((a,b)=>a.channel-b.channel)};
}
function pdfPageColumnPositions(pageInfo){
  if(pageInfo?._columnMap)return pageInfo._columnMap;
  const cols={};
  (pageInfo?.items||[])
    .filter(item=>item.top<38&&/^[A-Q]$/i.test(normalizePdfText(item.str)))
    .forEach(item=>{cols[normalizePdfText(item.str).toUpperCase()]=item.x});
  const letters='ABCDEFGHIJKLMNOPQ'.split('');
  if(Object.keys(cols).length<6){
    const left=(pageInfo?.width||1000)*0.06,right=(pageInfo?.width||1000)*0.96;
    letters.forEach((letter,index)=>{if(cols[letter]==null)cols[letter]=left+((right-left)*index)/(letters.length-1)});
  }
  pageInfo._columnMap=cols;
  return cols;
}
function resolvePdfFolioReferenceLabel(ref,pageInfos){
  const match=String(ref||'').match(/\(?\s*(\d{2})\s*-\s*([A-Q])\s*\)?/i);
  if(!match)return '';
  const pageNo=Number(match[1]),column=match[2].toUpperCase();
  const pageInfo=pageInfos.get(pageNo);
  if(!pageInfo)return '';
  const allEquipmentSeeds=(pageInfo.items||[]).filter(item=>/^(?:V3V|V6V|VAV|VANNE|POMPE|VENTILATEUR|CHAUDIERE|PAC)\b/i.test(normalizePdfText(item.str)));
  if(allEquipmentSeeds.length===1){
    const seed=allEquipmentSeeds[0];
    const exactParts=(pageInfo.items||[])
      .filter(item=>Math.abs(item.x-seed.x)<105&&item.top>=seed.top-4&&item.top<seed.top+22)
      .sort((a,b)=>a.top-b.top||a.x-b.x)
      .map(item=>normalizePdfText(item.str))
      .filter(value=>/^(?:V3V|V6V|VAV|VANNE|POMPE|VENTILATEUR|CHAUDIERE|PAC|SIEMENS|SAS)/i.test(value));
    const exactLabel=cleanIntegratedPdfLabel(exactParts.join(' '));
    if(exactLabel)return exactLabel;
  }
  const cols=pdfPageColumnPositions(pageInfo),targetX=cols[column];
  if(!Number.isFinite(targetX))return '';
  const equipmentSeeds=(pageInfo.items||[])
    .filter(item=>/^(?:V3V|V6V|VAV|VANNE|POMPE|VENTILATEUR|CHAUDIERE|PAC)/i.test(normalizePdfText(item.str)))
    .sort((a,b)=>Math.abs(a.x-targetX)-Math.abs(b.x-targetX));
  const equipmentSeed=equipmentSeeds.find(item=>Math.abs(item.x-targetX)<350);
  if(equipmentSeed){
    const equipmentParts=(pageInfo.items||[])
      .filter(item=>Math.abs(item.x-equipmentSeed.x)<105&&item.top>=equipmentSeed.top-4&&item.top<equipmentSeed.top+22)
      .sort((a,b)=>a.top-b.top||a.x-b.x)
      .map(item=>normalizePdfText(item.str))
      .filter(value=>!(/^(?:M|Y|0V|24V|COM|\d+)$/i.test(value)));
    const equipmentLabel=cleanIntegratedPdfLabel(equipmentParts.join(' '));
    if(equipmentLabel)return equipmentLabel;
  }
  const candidates=(pageInfo.lines||[])
    .map(line=>({...line,label:cleanIntegratedPdfLabel(line.text)}))
    .filter(line=>line.label)
    .filter(line=>line.top>40&&line.top<(pageInfo.height||1e9)-55)
    .filter(line=>!isPdfFolioReference(line.label))
    .filter(line=>!/^(?:\d+|PHASE\s*\d|NEUTRE|FT|TT|Q[A-Z0-9]+|X\d+|P\d+|H\d+|C\d+|NO|NC|L|N|PE|24V|0V|230V|COM|HOST|SUBNET)$/i.test(line.label))
    .filter(line=>!/(?:DUMORTIER|COPAXSO|DISTRIBUTION|REGULATION|DEPART DIRECT|DESSIN|MODIFI|PAR|ROUGE|BLEU|MARRON|NOIR|BLANC|VIOLET)/i.test(line.label));
  if(!candidates.length)return '';
  const nearby=candidates.filter(line=>Math.abs((line.cx??line.x)-targetX)<90||(line.x<=targetX+20&&line.x2>=targetX-20));
  const ranked=(nearby.length?nearby:candidates).sort((a,b)=>Math.abs((a.cx??a.x)-targetX)-Math.abs((b.cx??b.x)-targetX)||a.top-b.top);
  const seed=ranked[0];
  if(!seed)return '';
  const group=candidates
    .filter(line=>Math.abs((line.cx??line.x)-(seed.cx??seed.x))<65&&Math.abs(line.top-seed.top)<44)
    .sort((a,b)=>a.top-b.top);
  return cleanIntegratedPdfLabel(deduplicatePdfLabel(group.map(line=>line.label).join(' ')));
}
function enrichIntegratedControllerFolioReferences(module,pageInfos){
  if(!module||!pageInfos)return module;
  ['inputs','outputs'].forEach(key=>{
    module[key]=(module[key]||[]).map(point=>{
      if(!point?.folioRef)return point;
      const resolved=resolvePdfFolioReferenceLabel(point.folioRef,pageInfos);
      const shortRef=point.folioRef.replace(/[()]/g,'');
      if(resolved)return {...point,label:`${resolved} (${shortRef})`};
      if(!point.label||/^Vers folio /i.test(point.label))return {...point,label:`Vers folio ${shortRef}`};
      return point;
    });
  });
  return module;
}

function extractPdfIntegratedControllerPage(items,pageNumber,pageHeight,linesInput=null){
  const lines=Array.isArray(linesInput)?linesInput:clusterPdfLines(items);
  const allText=normalizePdfText(lines.map(l=>l.text).join(' ')+' '+items.map(i=>i.str).join(' '));
  const model=detectPdfControllerModel(allText);
  const definition=INTEGRATED_PDF_CONTROLLERS[model];
  if(!definition)return null;
  const inputMarkers=integratedMarkers(items,definition.inputKinds,definition).filter(m=>m.channel<=definition.inputCount);
  const outputMarkers=integratedMarkers(items,definition.outputKinds,definition).filter(m=>m.channel<=definition.outputCount);
  // Évite de reconnaître comme automate une simple mention dans la page de garde.
  if(inputMarkers.length+outputMarkers.length<4)return null;

  let points=null;
  if(model==='ECY-PTU-207'){
    const classic=ptuClassicControllerPoints(items,lines);
    if(classic)points=classic;
    else{
      const specific=ptuInputOutputPoints(items,inputMarkers,outputMarkers,lines);
      const generic=ptuGenericInputOutputPoints(items,lines,inputMarkers,outputMarkers,definition);
      points={
        inputs:mergeIntegratedPointLists(specific?.inputs,generic?.inputs,definition.inputCount),
        outputs:mergeIntegratedPointLists(specific?.outputs,generic?.outputs,definition.outputCount)
      };
    }
  }
  else if(model==='ECY-303')points=ecy303ClassicControllerPoints(items,lines,inputMarkers,outputMarkers)||zoneControllerPoints(items,inputMarkers,outputMarkers);
  else if(model==='ECY-400'||model==='ECY-450')points=ecy400ClassicControllerPoints(items,lines,inputMarkers,outputMarkers)||zoneControllerPoints(items,inputMarkers,outputMarkers);
  else if(model==='ECY-600'||model==='ECY-650')points=ecy600ClassicControllerPoints(items,lines,inputMarkers,outputMarkers)||zoneControllerPoints(items,inputMarkers,outputMarkers);
  else if(model==='ECY-300')points=zoneControllerPoints(items,inputMarkers,outputMarkers);

  let inputs=points?.inputs||[],outputs=points?.outputs||[];
  if(!points){
    const inputLabels=uniqueIntegratedLabels(integratedLabelCandidates(items,lines,'input').map(x=>({...x,label:cleanIntegratedPdfLabel(x.label)})));
    const outputLabels=uniqueIntegratedLabels(integratedLabelCandidates(items,lines,'output').map(x=>({...x,label:cleanIntegratedPdfLabel(x.label)})));
    inputs=associatePdfLabels(inputMarkers,inputLabels,definition.inputCount);
    outputs=associatePdfLabels(outputMarkers,outputLabels,definition.outputCount);
    const geometricOutputs=associateHorizontalOutputLabels(items,outputMarkers,definition.outputCount);
    outputs=mergePdfChannelLabels(geometricOutputs,outputs,definition.outputCount);
  }
  inputs=inputs.filter(p=>p.label).map(point=>({...point,code:integratedPointCode(definition,'input',point.channel)}));
  outputs=outputs.filter(p=>p.label).map(point=>({...point,code:integratedPointCode(definition,'output',point.channel)}));
  return {page:pageNumber,pages:[pageNumber],type:model,instance:'',inputs,outputs,communication:false,integratedController:true,textCount:items.length,pageHeight};
}
function mergeIntegratedPdfPage(collection,page){
  if(!page?.integratedController){collection.push(page);return}
  const previous=[...collection].reverse().find(item=>item?.integratedController&&item.type===page.type);
  if(!previous||Math.max(...(previous.pages||[previous.page]))+1!==page.page){collection.push(page);return}
  const previousInput=new Set(previous.inputs.map(p=>p.channel)),previousOutput=new Set(previous.outputs.map(p=>p.channel));
  const overlaps=page.inputs.some(p=>previousInput.has(p.channel))||page.outputs.some(p=>previousOutput.has(p.channel));
  if(overlaps){collection.push(page);return}
  previous.inputs=mergePdfChannelLabels(previous.inputs,page.inputs,Math.max(previous.inputs.length+page.inputs.length,32));
  previous.outputs=mergePdfChannelLabels(previous.outputs,page.outputs,Math.max(previous.outputs.length+page.outputs.length,32));
  previous.pages=[...(previous.pages||[previous.page]),page.page];
  previous.page=Math.min(...previous.pages);
}
function detectPdfControllerModel(text){
  const value=normalizePdfText(text).toUpperCase().replace(/[‐‑–—]/g,'-');
  // PDF.js peut découper la référence caractère par caractère ou remplacer le chiffre 0 par la lettre O.
  const compact=value.replace(/[^A-Z0-9]/g,'');
  const compactDigits=compact.replace(/O/g,'0');
  const contains=(...patterns)=>patterns.some(pattern=>compact.includes(pattern)||compactDigits.includes(pattern));

  if(contains('ECYPTU207','PTU207','ECLYPSEPTU207'))return 'ECY-PTU-207';
  if(contains('ECY650','ECLYPSEECY650','ECLYPSE650'))return 'ECY-650';
  if(contains('ECY600','ECLYPSEECY600','ECLYPSE600'))return 'ECY-600';
  if(contains('ECY450','ECLYPSEECY450','ECLYPSE450'))return 'ECY-450';
  if(contains('ECY400','ECLYPSEECY400','ECLYPSE400'))return 'ECY-400';
  if(contains('ECY300','ECLYPSEECY300','ECLYPSE300'))return 'ECY-300';
  if(contains('ECY303','ECLYPSEECY303','ECLYPSE303'))return 'ECY-303';
  if(contains('ECYS1000E320','ECYS1000320','S1000E320','S1000320'))return 'ECY-S1000E-320';
  if(contains('ECYS1000E28','ECYS100028','S1000E28','S100028'))return 'ECY-S1000E-28';
  if(contains('ECYS1000E48','ECYS100048','S1000E48','S100048'))return 'ECY-S1000E-48';
  // Une référence S1000E sans suffixe est interprétée comme le modèle 48 pour les anciens plans.
  if(contains('ECYS1000E','ECYS1000','S1000E','S1000'))return 'ECY-S1000E-48';
  return '';
}
function detectPdfPowerSupply(text){
  const value=normalizePdfText(text).toUpperCase().replace(/[‐‑–—]/g,'-');
  if(/(?:ECY\s*[-_]?\s*)?PS\s*100\s*[-_]?\s*240\b/.test(value))return {value:'230V',reference:'ECY-PS100-240',label:'100–240 VAC'};
  if(/(?:ECY\s*[-_]?\s*)?PS\s*24\b/.test(value))return {value:'24V',reference:'ECY-PS24',label:'24 VAC/DC'};
  return null;
}
async function parseElectricalPdf(file){
  const pdfjs=await getPdfjs();
  const data=new Uint8Array(await file.arrayBuffer());
  const task=pdfjs.getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:true,stopAtErrors:false});
  const doc=await task.promise;
  const modules=[];
  const documentText=[];
  const pageInfos=new Map();
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
    const page=await doc.getPage(pageNo);
    const viewport=page.getViewport({scale:1});
    const content=await page.getTextContent({includeMarkedContent:false,disableNormalization:false});
    const items=content.items.filter(i=>i.str&&normalizePdfText(i.str)).map(i=>{
      const t=i.transform||[1,0,0,1,0,0],angle=pdfAngle(t),x=t[4]||0,y=t[5]||0;
      return {str:normalizePdfText(i.str),x,y,top:viewport.height-y,width:Math.abs(i.width||0),height:Math.abs(i.height||Math.hypot(t[2]||0,t[3]||0)||10),angle};
    });
    const lines=clusterPdfLines(items);
    pageInfos.set(pageNo,{pageNo,width:viewport.width,height:viewport.height,items,lines});
    documentText.push(items.map(i=>i.str).join(' '));
    const parsed=extractPdfModulePage(items,pageNo,viewport.height)||extractPdfIntegratedControllerPage(items,pageNo,viewport.height,lines);
    if(parsed)mergeIntegratedPdfPage(modules,parsed);
  }
  modules.filter(module=>module?.integratedController).forEach(module=>enrichIntegratedControllerFolioReferences(module,pageInfos));
  const fullText=documentText.join(' ');
  const normalizedFullText=normalizePdfText(fullText).toUpperCase();
  if(/ECY\s*[- ]?600\s*[- ]?2/.test(normalizedFullText)&&/DEF\s*MANQUE\s*GAZ/.test(normalizedFullText)&&/0\s*[-–]\s*10\s*V\s*CHAUDI[EÈÉ]RES?/.test(normalizedFullText)){
    modules.filter(module=>module?.integratedController&&['ECY-600','ECY-650'].includes(normalizeControllerReference(module.type))).forEach(module=>{
      module.outputs=(module.outputs||[]).filter(point=>Number(point.channel)<=9);
      const fixedOutputs=[
        {channel:7,label:'CDE PPES CR3 40kW'},
        {channel:8,label:'CDE PPES CR4 20kW'},
        {channel:9,label:'0-10V Chaudières'}
      ];
      module.outputs=mergeIntegratedPointLists((module.outputs||[]).filter(point=>Number(point.channel)<7),fixedOutputs,14);
    });
  }
  const controllers=[];
  modules.filter(module=>module?.integratedController).forEach(module=>{
    const model=normalizeControllerReference(module.type);
    if(model&&!controllers.includes(model))controllers.push(model);
  });
  // Les S1000E ne portent pas d'E/S intégrées et ne créent donc pas de page automate.
  // On conserve leur détection textuelle, mais les ECY-300/303/400/450/600/650/PTU-207
  // ne sont retenus que lorsqu'une vraie rangée de bornes a été reconnue.
  documentText.forEach(pageText=>{
    const model=detectPdfControllerModel(pageText);
    if(/^ECY-S1000/.test(model)&&!controllers.includes(model))controllers.push(model);
  });
  const controller=controllers[0]||detectPdfControllerModel(fullText);
  const ctrlInfo=controllerInfo(controller||'ECY-S1000E-48');
  const supply=ctrlInfo.integratedPower?{value:'integrated',reference:ctrlInfo.reference,label:ctrlInfo.powerLabel}:detectPdfPowerSupply(fullText);
  return {numPages:doc.numPages,modules,controller,controllers,powerSupply:supply?.value||'',powerSupplyReference:supply?.reference||'',powerSupplyLabel:supply?.label||'',integratedPower:!!ctrlInfo.integratedPower};
}

// ===================== INTERFACE PUBLIQUE =====================
export async function importPdf(file) {
  const result = await parseElectricalPdf(file);
  if (!result.modules.length && !result.controller)
    throw new Error("Aucun automate ECY (300/303/400/450/600/650/PTU-207/S1000E) ni module E/S compatible n'a été détecté dans le texte vectoriel du PDF.");
  let nextIoNumber = 1, nextComm = -1, nextIntegrated = -100;
  const modules = result.modules.map((m) => {
    if (isCommunicationType(m.type)) return detectModuleDefinition(nextComm--, m.type, "");
    if (isIntegratedControllerType(m.type)) return detectModuleDefinition(nextIntegrated--, m.type, "");
    return detectModuleDefinition(nextIoNumber++, m.type, "");
  });
  const points = [];
  result.modules.forEach((m, i) => {
    const mod = modules[i];
    if (isCommunicationType(mod)) return;
    const pageLabel = (m.pages || [m.page]).filter(Boolean).join(", ");
    const sourceKind = isIntegratedControllerType(mod) ? "Automate " + mod.type : "Module " + mod.number;
    (m.inputs || []).forEach((p) => {
      const channel = p.channel;
      const code = p.code || modulePointCode("input", mod, channel);
      const signal = (mod.type === "16DI" || /^DI/i.test(code)) ? "D" : inferPdfSignal(p.label, "input");
      points.push({ direction: "input", designation: p.label, repere: code, signal, source: "Import PDF - " + sourceKind + " / " + code + " (p." + pageLabel + ")", relay: "", active: true, module: mod.number, channel, uid: uid() });
    });
    (m.outputs || []).forEach((p) => {
      const channel = p.channel;
      const code = p.code || modulePointCode("output", mod, channel);
      const signal = (mod.type === "8DOR" || /^(?:DO|DUO)/i.test(code)) ? "D" : inferPdfSignal(p.label, "output");
      points.push({ direction: "output", designation: p.label, repere: code, signal, source: "Import PDF - " + sourceKind + " / " + code + " (p." + pageLabel + ")", relay: signal === "D" ? (mod.type.includes("DOR") || isIntegratedControllerType(mod) ? "Relais intégré" : "RE-12DC") : "", active: true, module: mod.number, channel, uid: uid() });
    });
  });
  const clean = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
  const controller = result.controller || "";
  const inputs = points.filter((p) => p.direction === "input").length;
  const outputs = points.length - inputs;
  const communications = modules.filter(isCommunicationType).length;
  return {
    controller,
    modules,
    points,
    projectFields: {
      name: file.name.replace(/\.pdf$/i, ""),
      header: clean,
      document_title: "Affectation entrées sorties automate Distech Controls\n« " + clean + " »",
      date: result.drawingDate || new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      power_supply: controllerHasIntegratedPower(controller) ? "integrated" : (result.powerSupply || "none"),
      gfx_header_3: controller + " - Affectation des entrées / sorties",
    },
    meta: {
      file: file.name,
      controller: controller || "Modèle non détecté",
      pages: result.numPages,
      inputs,
      outputs,
      modules: modules.length - communications,
      powerSupply: result.integratedPower ? result.powerSupplyLabel : (result.powerSupplyReference ? result.powerSupplyReference + " — " + result.powerSupplyLabel : "Non détectée dans le schéma"),
    },
  };
}
