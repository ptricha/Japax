// Lossless: drops the PNG/JPEG fallback copy of textures that already ship a WebP (EXT_texture_webp). Geometry & WebP bytes untouched.
import fs from 'fs';
const [,, inp, outp] = process.argv;
const buf = fs.readFileSync(inp); let off=12, json, bin;
while (off<buf.length){const len=buf.readUInt32LE(off),type=buf.readUInt32LE(off+4);const d=buf.subarray(off+8,off+8+len);if(type===0x4E4F534A)json=JSON.parse(d.toString('utf8'));else if(type===0x004E4942)bin=d;off+=8+len;}
let dropped=0;
for (const t of json.textures) { const w=t.extensions?.EXT_texture_webp; if (w && t.source!==undefined) { delete t.source; dropped++; } }
const refImgs = new Set(); for (const t of json.textures) { const i = t.extensions?.EXT_texture_webp?.source ?? t.source; if (i!==undefined) refImgs.add(i); }
const imgMap=new Map(); const newImgs=[]; json.images.forEach((im,i)=>{ if(refImgs.has(i)){ imgMap.set(i,newImgs.length); newImgs.push(im);} });
const keepBV = new Set(); json.accessors?.forEach(a=>{ if(a.bufferView!==undefined) keepBV.add(a.bufferView); });
for (const me of json.meshes||[]) for (const p of me.primitives) { const d=p.extensions?.KHR_draco_mesh_compression; if(d) keepBV.add(d.bufferView); }
for (const im of newImgs) keepBV.add(im.bufferView);
for (const a of json.animations||[]) {} // animation data lives in accessors
for (const sk of json.skins||[]) if (sk.inverseBindMatrices!==undefined) {} 
const bvMap=new Map(), newBV=[], chunks=[]; let pos=0;
json.bufferViews.forEach((bv,i)=>{ if(!keepBV.has(i)) return; const pad=(4-pos%4)%4; if(pad){chunks.push(Buffer.alloc(pad));pos+=pad;} const o=pos; const data=bin.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength); chunks.push(Buffer.from(data)); pos+=data.length; bvMap.set(i,newBV.length); newBV.push({...bv,byteOffset:o}); });
for (const a of json.accessors||[]) if(a.bufferView!==undefined) a.bufferView=bvMap.get(a.bufferView);
for (const me of json.meshes||[]) for (const p of me.primitives){const d=p.extensions?.KHR_draco_mesh_compression; if(d) d.bufferView=bvMap.get(d.bufferView);}
newImgs.forEach(im=>{ im.bufferView=bvMap.get(im.bufferView); });
json.images=newImgs; json.bufferViews=newBV;
for (const t of json.textures){ const w=t.extensions?.EXT_texture_webp; if(w) w.source=imgMap.get(w.source); }
const req=new Set(json.extensionsRequired||[]); if (dropped) req.add('EXT_texture_webp'); json.extensionsRequired=[...req];
const binOut=Buffer.concat(chunks); const bp=(4-binOut.length%4)%4; const binF=Buffer.concat([binOut,Buffer.alloc(bp)]);
json.buffers=[{byteLength:binF.length}];
let js=Buffer.from(JSON.stringify(json),'utf8'); js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
const total=12+8+js.length+8+binF.length; const h=Buffer.alloc(12); h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(total,8);
const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.writeUInt32LE(0x4E4F534A,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(binF.length,0);c2.writeUInt32LE(0x004E4942,4);
fs.writeFileSync(outp,Buffer.concat([h,c1,js,c2,binF])); console.log(inp.split('/').pop(),'->',(buf.length/1048576).toFixed(2),'MB =>',(total/1048576).toFixed(2),'MB; fallbacks dropped',dropped);
