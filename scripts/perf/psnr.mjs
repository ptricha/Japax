import sharp from 'sharp';
const [,, a, b, name] = process.argv;
const A = await sharp(a).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const B = await sharp(b).resize(A.info.width, A.info.height).ensureAlpha().raw().toBuffer();
let se=0, n=0; for (let i=0;i<A.data.length;i+=4) for (let c=0;c<3;c++){ const d=A.data[i+c]-B[i+c]; se+=d*d; n++; }
const mse=se/n; console.log(name, 'PSNR dB', (10*Math.log10(255*255/mse)).toFixed(1), 'size', A.info.width+'x'+A.info.height);
