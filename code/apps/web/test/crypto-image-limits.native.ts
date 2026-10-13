import assert from 'node:assert/strict';
import {before, test} from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import sharp from 'sharp';
import {preparePrivateImage,decodePrivateImage,decodeLegacyImage} from '../src/features/crypto/images.ts';
import {encryptAttachmentBytes,PrivateAttachmentError} from '../src/features/crypto/attachments.ts';
import {publicSha256} from '../src/features/crypto/canonical-json.ts';
import {inspectImageHeader} from '../src/features/crypto/image-header.ts';

before(()=>sdk.initAsync());
test('real sharp PNG, baseline/progressive JPEG and lossy/lossless/alpha WebP retain encoded dimensions',async()=>{
  for(const format of ['png','jpeg','progressive-jpeg','webp','lossless-webp','alpha-webp']){
    const image=sharp({create:{width:24,height:18,channels:format==='alpha-webp'?4:3,background:{r:10,g:100,b:30,alpha:.5}}});
    const bytes=await (format==='png'?image.png():format.includes('jpeg')?image.jpeg({progressive:format==='progressive-jpeg'}):image.webp({lossless:format==='lossless-webp'})).toBuffer();
    const mime=format.includes('jpeg')?'image/jpeg':format==='png'?'image/png':'image/webp';
    assert.deepEqual(inspectImageHeader(bytes,mime),{width:24,height:18});
    assert.throws(()=>inspectImageHeader(bytes.subarray(0,12),mime),PrivateAttachmentError);
  }
});
// Decoder spy proves rejection occurs before browser allocation, not successful pixel decoding.
async function withoutDecode(action:()=>Promise<unknown>){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');let calls=0;
  Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>{calls++;throw new Error('Decoder allocation must not occur');}});
  try{await assert.rejects(action,PrivateAttachmentError);assert.equal(calls,0,'Reject encoded type/dimensions before browser decoder allocation');}
  finally{if(previous)Object.defineProperty(globalThis,'createImageBitmap',previous);else Reflect.deleteProperty(globalThis,'createImageBitmap');}
}
test('mislabeled GIF and SVG cannot enter JPG/PNG/WebP preparation before pixel decoding',async()=>{
  for(const bytes of [Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b','hex'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')]){
    await withoutDecode(()=>preparePrivateImage(new File([bytes],'mislabelled.png',{type:'image/png'})));
  }
});
test('real PNG/JPEG MIME mismatch rejects before decoding',async()=>{
  const jpeg=await sharp({create:{width:24,height:18,channels:3,background:'green'}}).jpeg().toBuffer();
  await withoutDecode(()=>preparePrivateImage(new File([jpeg],'mislabelled.png',{type:'image/png'})));
});
test('oversized encoded PNG dimensions reject before decoding even with tiny compressed input',async()=>{
  const png=await sharp({create:{width:24,height:18,channels:3,background:'green'}}).png().toBuffer();png.writeUInt32BE(6000,16);png.writeUInt32BE(4000,20);
  await withoutDecode(()=>preparePrivateImage(new File([png],'oversized.png',{type:'image/png'})));
});
test('native authenticated WebP with false small metadata rejects encoded oversized canvas before decoding',async()=>{
  const webp=await sharp({create:{width:24,height:18,channels:4,background:{r:0,g:120,b:0,alpha:.5}}}).webp().toBuffer();
  assert.equal(webp.toString('ascii',12,16),'VP8X');webp.writeUIntLE(5999,24,3);webp.writeUIntLE(3999,27,3);
  const encrypted=encryptAttachmentBytes(webp);
  try{await withoutDecode(()=>decodePrivateImage(encrypted.ciphertext,{secret:encrypted.secret,plaintextSize:webp.length,mimeType:'image/webp',width:24,height:18}));}
  finally{encrypted.ciphertext.fill(0);webp.fill(0);}
});
test('legacy native image source hash does not permit oversized encoded source or MIME deception',async()=>{
  const png=await sharp({create:{width:24,height:18,channels:3,background:'green'}}).png().toBuffer();png.writeUInt32BE(6000,16);png.writeUInt32BE(4000,20);
  const encrypted=encryptAttachmentBytes(png),plaintextSha256=await publicSha256(png);
  try{await withoutDecode(()=>decodeLegacyImage(encrypted.ciphertext,{secret:encrypted.secret,fileSize:png.length,mimeType:'image/png',plaintextSha256}));}
  finally{encrypted.ciphertext.fill(0);png.fill(0);}
});
