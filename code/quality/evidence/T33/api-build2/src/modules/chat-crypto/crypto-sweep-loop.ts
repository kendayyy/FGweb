/** Single periodic sweep; failures expose no error object to the logger. */
export class CryptoSweepLoop{
 private timer?:ReturnType<typeof setInterval>;
 private active?:Promise<void>;
 private stopped=false;
 constructor(private readonly run:()=>Promise<void>,private readonly failed:()=>void,private readonly intervalMs=60000){if(!Number.isSafeInteger(intervalMs)||intervalMs<=0||intervalMs>2147483647)throw new Error('Invalid sweep interval');}
 start(){
  if(this.timer||this.stopped)return;
  this.timer=setInterval(()=>{
   if(this.active)return;
   this.active=Promise.resolve().then(()=>this.run()).catch(()=>{try{this.failed();}catch{/* Logging cannot break retry or shutdown. */}}).finally(()=>{this.active=undefined;});
  },this.intervalMs);this.timer.unref();
 }
 async stop(){this.stopped=true;if(this.timer){clearInterval(this.timer);this.timer=undefined;}await this.active;}
}
