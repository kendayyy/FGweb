import {MAX_IMAGE_PIXELS,MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES} from '@fg/contracts';
import {PrivateAttachmentError} from './attachments';

type Dimensions={width:number;height:number};
function bounded(width:number,height:number):Dimensions {
  if(!width||!height||width>10000||height>10000||width*height>MAX_IMAGE_PIXELS)throw new PrivateAttachmentError();
  return {width,height};
}
/** Allocation guard only; the browser still validates/decodes the complete image.
 * Sources: W3C PNG IHDR, Google WebP RIFF/lossless specs, libjpeg-turbo get_sof.
 */
export function inspectImageHeader(bytes:Uint8Array,mimeType:string):Dimensions {
  try {
    if(!bytes.length||bytes.length>MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES)throw new PrivateAttachmentError();
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const ascii=(offset:number,length:number)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
    if(mimeType==='image/png'){
      if(bytes.length<33||!([137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte))||view.getUint32(8)!==13||ascii(12,4)!=='IHDR')throw new PrivateAttachmentError();
      const dimensions=bounded(view.getUint32(16),view.getUint32(20));
      for(let offset=8;offset<bytes.length;){
        if(offset+12>bytes.length)throw new PrivateAttachmentError();const length=view.getUint32(offset),end=offset+12+length;if(end>bytes.length)throw new PrivateAttachmentError();
        if(ascii(offset+4,4)==='fcTL'){
          if(length!==26)throw new PrivateAttachmentError();const frame=bounded(view.getUint32(offset+12),view.getUint32(offset+16));
          if(frame.width+view.getUint32(offset+20)>dimensions.width||frame.height+view.getUint32(offset+24)>dimensions.height)throw new PrivateAttachmentError();
        }
        offset=end;
      }
      return dimensions;
    }
    if(mimeType==='image/jpeg'){
      if(bytes[0]!==255||bytes[1]!==216)throw new PrivateAttachmentError();let dimensions:Dimensions|undefined;
      for(let offset=2;offset<bytes.length;){
        if(bytes[offset++]!==255)throw new PrivateAttachmentError();while(bytes[offset]===255)offset++;
        const marker=bytes[offset++];if(marker===218){if(!dimensions)throw new PrivateAttachmentError();return dimensions;}
        if(marker===217||marker===0||marker===216)throw new PrivateAttachmentError();
        if(marker===1||(marker>=208&&marker<=215))continue;
        const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)throw new PrivateAttachmentError();
        if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
          if(dimensions||length<8||length!==8+3*bytes[offset+7])throw new PrivateAttachmentError();dimensions=bounded(view.getUint16(offset+5),view.getUint16(offset+3));
        }
        offset+=length;
      }
      throw new PrivateAttachmentError();
    }
    if(mimeType==='image/webp'){
      if(bytes.length<25||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP'||view.getUint32(4,true)!==bytes.length-8)throw new PrivateAttachmentError();
      const uint24=(offset:number)=>bytes[offset]+bytes[offset+1]*256+bytes[offset+2]*65536;
      let canvas:Dimensions|undefined,imageSeen=false;
      function bitstream(type:string,start:number,length:number):Dimensions {
        if(type==='VP8 '){if(length<10||(bytes[start]&1)!==0||ascii(start+3,3)!=='\x9d\x01\x2a')throw new PrivateAttachmentError();return bounded(view.getUint16(start+6,true)&16383,view.getUint16(start+8,true)&16383);}
        if(length<5||bytes[start]!==47)throw new PrivateAttachmentError();const packed=view.getUint32(start+1,true);if(packed>>>29)throw new PrivateAttachmentError();return bounded((packed&16383)+1,((packed>>>14)&16383)+1);
      }
      for(let offset=12;offset<bytes.length;){
        if(offset+8>bytes.length)throw new PrivateAttachmentError();const type=ascii(offset,4),length=view.getUint32(offset+4,true),start=offset+8,end=start+length+(length%2);if(end>bytes.length)throw new PrivateAttachmentError();
        if(type==='VP8X'){if(offset!==12||length!==10)throw new PrivateAttachmentError();canvas=bounded(uint24(start+4)+1,uint24(start+7)+1);}
        else if(type==='VP8 '||type==='VP8L'){
          const dimensions=bitstream(type,start,length);if(canvas&&(dimensions.width!==canvas.width||dimensions.height!==canvas.height))throw new PrivateAttachmentError();canvas??=dimensions;imageSeen=true;
        }else if(type==='ANMF'){
          if(!canvas||length<16)throw new PrivateAttachmentError();const frame=bounded(uint24(start+6)+1,uint24(start+9)+1);
          if(uint24(start)*2+frame.width>canvas.width||uint24(start+3)*2+frame.height>canvas.height)throw new PrivateAttachmentError();
          let frameSeen=false;
          for(let nested=start+16;nested<start+length;){
            if(nested+8>start+length)throw new PrivateAttachmentError();const kind=ascii(nested,4),size=view.getUint32(nested+4,true),next=nested+8+size+(size%2);if(next>start+length)throw new PrivateAttachmentError();
            if(kind==='VP8 '||kind==='VP8L'){const dimensions=bitstream(kind,nested+8,size);if(dimensions.width!==frame.width||dimensions.height!==frame.height)throw new PrivateAttachmentError();frameSeen=true;}nested=next;
          }
          if(!frameSeen)throw new PrivateAttachmentError();imageSeen=true;
        }
        offset=end;
      }
      if(!canvas||!imageSeen)throw new PrivateAttachmentError();return canvas;
    }
    throw new PrivateAttachmentError();
  }catch{throw new PrivateAttachmentError();}
}
