"""Read-only Windows process CPU/working-set observer; no command lines or environment."""
import argparse, ctypes as c, json, os, time
from ctypes import wintypes as w
from datetime import datetime, timezone

p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--stop',required=True);p.add_argument('--seconds',type=float,default=600);p.add_argument('--interval',type=float,default=5);a=p.parse_args()
if os.name!='nt':raise RuntimeError('Windows only')
if not 1<=a.seconds<=600 or not 1<=a.interval<=10:raise ValueError('Bounded sampling required')
if os.path.exists(a.output):raise FileExistsError(a.output)
k=c.WinDLL('kernel32',use_last_error=True);ps=c.WinDLL('psapi',use_last_error=True)
class Entry(c.Structure):
 _fields_=[('size',w.DWORD),('usage',w.DWORD),('pid',w.DWORD),('heap',c.c_size_t),('module',w.DWORD),('threads',w.DWORD),('parent',w.DWORD),('priority',w.LONG),('flags',w.DWORD),('name',w.WCHAR*260)]
class Memory(c.Structure):
 _fields_=[('cb',w.DWORD),('faults',w.DWORD)]+[(n,c.c_size_t) for n in ['peakWorking','working','peakPaged','paged','peakNonpaged','nonpaged','pagefile','peakPagefile']]
k.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];k.CreateToolhelp32Snapshot.restype=w.HANDLE
for name in ['Process32FirstW','Process32NextW']:
 f=getattr(k,name);f.argtypes=[w.HANDLE,c.POINTER(Entry)];f.restype=w.BOOL
k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
k.CloseHandle.argtypes=[w.HANDLE];k.CloseHandle.restype=w.BOOL
k.GetProcessTimes.argtypes=[w.HANDLE]+[c.POINTER(w.FILETIME)]*4;k.GetProcessTimes.restype=w.BOOL
ps.GetProcessMemoryInfo.argtypes=[w.HANDLE,c.POINTER(Memory),w.DWORD];ps.GetProcessMemoryInfo.restype=w.BOOL
ticks=lambda t:(t.dwHighDateTime<<32)|t.dwLowDateTime
stamp=lambda:datetime.now(timezone.utc).isoformat()
def snapshot():
 result={};skipped=0;handle=k.CreateToolhelp32Snapshot(2,0)
 if handle==c.c_void_p(-1).value:raise c.WinError(c.get_last_error())
 try:
  e=Entry();e.size=c.sizeof(e);ok=k.Process32FirstW(handle,c.byref(e))
  while ok:
   h=k.OpenProcess(0x1000|0x10,False,e.pid)
   if not h:h=k.OpenProcess(0x1000,False,e.pid)
   if h:
    try:
     created,ended,kernel,user=[w.FILETIME() for _ in range(4)];m=Memory();m.cb=c.sizeof(m)
     if k.GetProcessTimes(h,*[c.byref(t) for t in [created,ended,kernel,user]]):
      memory=round(m.working/1048576,2) if ps.GetProcessMemoryInfo(h,c.byref(m),c.sizeof(m)) else None
      result[(e.pid,ticks(created))]={'pid':e.pid,'name':e.name,'cpu':(ticks(kernel)+ticks(user))/1e7,'workingMB':memory}
     else:skipped+=1
    finally:k.CloseHandle(h)
   else:skipped+=1
   ok=k.Process32NextW(handle,c.byref(e))
 finally:k.CloseHandle(handle)
 return result,skipped
start=time.monotonic();began=stamp();old,skipped=snapshot();previous=time.monotonic();samples=[]
while time.monotonic()-start<a.seconds and not os.path.exists(a.stop):
 time.sleep(min(a.interval,max(0,a.seconds-(time.monotonic()-start))))
 new,skipped=snapshot();now=time.monotonic();elapsed=now-previous;rows=[]
 for key,r in new.items():
  if key in old:
   delta=max(0,r['cpu']-old[key]['cpu']);rows.append({'pid':r['pid'],'name':r['name'],'cpuSeconds':round(delta,4),'oneCorePercent':round(delta/elapsed*100,2),'workingMB':r['workingMB']})
 samples.append({'at':stamp(),'intervalSeconds':round(elapsed,3),'processCount':len(new),'inaccessibleCount':skipped,'topCpu':sorted(rows,key=lambda r:r['cpuSeconds'],reverse=True)[:12],'topWorkingSet':sorted(rows,key=lambda r:r['workingMB'] or 0,reverse=True)[:8]})
 old=new;previous=now
with open(a.output,'x',encoding='utf-8') as f:json.dump({'startedAt':began,'completedAt':stamp(),'readOnly':True,'privacy':'Names/PIDs/CPU/working set only; no command lines, paths or environment','samples':samples},f,indent=2)
print('Read-only process observer completed; samples='+str(len(samples)))
