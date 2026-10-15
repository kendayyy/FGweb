export interface InstallPrompt extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>;}
export type InstallState={available:boolean;installed:boolean;busy:boolean;message:string};
export class InstallationController {
 private event?:InstallPrompt;private generation=0;private state:InstallState={available:false,installed:false,busy:false,message:''};private listeners=new Set<()=>void>();
 snapshot=()=>this.state;
 listen=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(state:InstallState){this.state=state;this.listeners.forEach(listener=>listener());}
 offer(event:InstallPrompt){event.preventDefault();this.event=event;this.update({...this.state,available:true,message:''});}
 installed(){this.generation++;this.event=undefined;this.update({available:false,installed:true,busy:false,message:'FG đã được thêm vào thiết bị.'});}
 async install(gesture:boolean){if(!gesture||!this.event||this.state.busy)return;const event=this.event,generation=this.generation;this.event=undefined;this.update({...this.state,available:false,busy:true,message:''});
  try{await event.prompt();const choice=await event.userChoice;if(generation!==this.generation)return;this.update({...this.state,busy:false,message:choice.outcome==='accepted'?'Trình duyệt đã nhận yêu cầu cài FG.':'Bạn đã bỏ qua cài đặt; website vẫn sử dụng bình thường.'});}
  catch{if(generation===this.generation)this.update({...this.state,busy:false,message:'Chưa mở được cài đặt. Dùng menu trình duyệt để thêm FG.'});}
 }
}
