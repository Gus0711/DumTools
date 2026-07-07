import fs from "node:fs";
import JSZip from "jszip";
import type { PointRow } from "../src/tools/liste-points/model";
import { planAssignment } from "../src/tools/liste-points/gfx-export/assign";
import { transformMain } from "../src/tools/liste-points/gfx-export/writer";
import { getController } from "../src/tools/liste-points/gfx-export/controllers";
const OUT="/tmp/claude-1000/-home-gus-Projets-DumTools/98655cbe-34ce-4ff0-b560-8644bed96831/scratchpad";
const mk=(nom:string,io:Partial<PointRow["io"]>):PointRow=>({id:nom,kind:"point",nom,io:{AI:0,DI:0,AO:0,DO:0,COM:0,...io} as PointRow["io"]});
const base:PointRow[]=[mk("Sonde départ",{AI:1}),mk("Sonde ambiance",{AI:1}),mk("Defaut pompe 1",{DI:1}),mk("Commande V3V",{AO:1}),mk("Commande pompe",{DO:1}),mk("Commande pompe",{DO:1})];
async function run(ref:string,rows:PointRow[],tag:string){
  const ctrl=getController(ref)!; const plan=planAssignment(rows,ctrl);
  const zip=await JSZip.loadAsync(fs.readFileSync(`public/gfx-templates/${ref}.gfx`));
  const me=Object.keys(zip.files).find(n=>n.toLowerCase().endsWith("main.xml"))!;
  const {main}=transformMain(await zip.files[me].async("string"),plan,`TEST ${ref}`,{date:"2026-07-06",chantier:"Chaufferie Nord",client:"DALKIA"});
  fs.writeFileSync(`${OUT}/v_${tag}.main.xml`,main);
}
for(const r of ["ECY-400","ECY-PTU-207","ECY-303","ECY-600","ECY-S1000E"]) await run(r,base,r);
console.log("ok");
