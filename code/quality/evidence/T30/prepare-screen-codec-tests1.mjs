import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const d='quality/evidence/T30',p='apps/web/test/live-viewer.test.tsx',old=fs.readFileSync(p,'utf8');
const cases=`
  for(const [name,sender,expected] of [
    ['advertised H264',{getCapabilities:()=>({codecs:[{mimeType:'video/VP8'},{mimeType:'video/H264'}]})},'h264'],
    ['VP8 only',{getCapabilities:()=>({codecs:[{mimeType:'video/VP8'}]})},undefined],
    ['missing capability API',undefined,undefined],
    ['capability query throws',{getCapabilities:()=>{throw new Error('not available');}},undefined],
  ] as const)it('preserves capture/claim/release with codec capability '+name,async()=>{
    const saved=Object.getOwnPropertyDescriptor(globalThis,'RTCRtpSender');Object.defineProperty(globalThis,'RTCRtpSender',{value:sender,configurable:true});
    try{
      renderLiveViewer();fireEvent.click(await screen.findByRole('button',{name:/Chia sẻ màn hình/i}));
      await waitFor(()=>expect(screen.getByRole('button',{name:/Dừng chia sẻ/i})).toBeInTheDocument());
      const publish=mockTransport.latestRoom!.localParticipant.publishTrack;
      expect(publish).toHaveBeenCalledTimes(1);expect(publish.mock.calls[0][1].videoCodec).toBe(expected);
      expect(publish.mock.calls[0][1].screenShareEncoding).toEqual(expect.objectContaining({maxFramerate:30,priority:'low'}));
      expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);expect(requests.filter(r=>r.url.endsWith('/screen-share/claim'))).toHaveLength(1);
      fireEvent.click(screen.getByRole('button',{name:/Dừng chia sẻ/i}));await waitFor(()=>expect(requests.filter(r=>r.url.endsWith('/screen-share/release'))).toHaveLength(1));expect(mockTrack.stop).toHaveBeenCalled();
    }finally{if(saved)Object.defineProperty(globalThis,'RTCRtpSender',saved);else delete (globalThis as {RTCRtpSender?:unknown}).RTCRtpSender;}
  });
`;
let relocated=old.replaceAll("from '../src/","from '../../../../apps/web/src/");const end=relocated.lastIndexOf('});');assert(end>0);const next=relocated.slice(0,end)+cases+relocated.slice(end);assert.equal(next.replace(cases,'').replaceAll("from '../../../../apps/web/src/","from '../src/"),old);
fs.mkdirSync(d+'/screen-codec-tests1');fs.writeFileSync(d+'/screen-codec-tests1/live-viewer-codec.test.tsx',next,{flag:'wx'});
const config=fs.readFileSync(d+'/web-lazy-media-vitest2.config.mts','utf8').replaceAll('web-lazy-media-tests2','screen-codec-tests1');fs.writeFileSync(d+'/screen-codec-vitest1.config.mts',config,{flag:'wx'});
fs.writeFileSync(d+'/screen-codec-test-source-review1.json',JSON.stringify({at:new Date().toISOString(),originalPath:p,originalSha256:createHash('sha256').update(old).digest('hex'),copySha256:createHash('sha256').update(next).digest('hex'),originalCasesAssertionsDeadlinesUnchanged:true,reverseByteExact:true,additionalCases:4},null,2)+'\n',{flag:'wx'});console.log('Four capability/capture/claim/release cases added to exact original live-viewer copy; original unchanged.');
