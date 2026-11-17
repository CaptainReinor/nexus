import {useEffect,useRef,useState} from 'react';
import type {FocusAPI,FocusAction,FocusTurnInput} from '../../shared/focus-mode';
import {captureLabels,directCapture,type CaptureKind} from '../../shared/home';
import {askConfirm} from '../confirm';
import {errorText} from '../ui';
import {ZodError} from 'zod';

type Audio={blob:Blob;format:'webm'|'wav'|'mp3';day:string;text?:string};
export function useCapture(api:FocusAPI,day:string,onSaved:()=>void|Promise<void>){
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[recording,setRecording]=useState(false),[audio,setAudio]=useState<Audio|null>(null),[receipt,setReceipt]=useState<FocusTurnInput|null>(null);
 const locked=useRef(false),mounted=useRef(true),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const pending=useRef<{signature:string;input:FocusTurnInput}|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 async function budget<T>(run:(override:boolean)=>Promise<T>,override=false):Promise<T>{try{return await run(override);}catch(error){if(override||!errorText(error).includes('AI_BUDGET_CONFIRM'))throw error;if(!await askConfirm('Продолжить запрос к ИИ? Стоимость прошлых запросов неизвестна или достигнут лимит.'))throw Error('Запрос отменён.');return run(true);}}
 async function save(text:string,actions:FocusAction[]|null,selectedDay:string,override=false){
  const signature=JSON.stringify({text,actions,day:selectedDay});
  if(pending.current?.signature!==signature){
   const reply=actions===null?await budget(flag=>api.send({text,day:selectedDay,overrideBudget:flag}),override):{reply:'',actions};
   pending.current={signature,input:{id:crypto.randomUUID(),day:selectedDay,text,reply:reply.reply,actions:reply.actions,replace:false,expectedUpdatedAt:null}};
  }
  const saved=pending.current.input;await api.save(saved);pending.current=null;
  if(mounted.current){setMessage('Записано');setAudio(null);setReceipt(saved);}
  void Promise.resolve(onSaved()).catch(()=>{if(mounted.current)setError('Запись сохранена. Не удалось обновить экран.');});
 }
 async function run(operation:()=>Promise<void>){if(locked.current||recorder.current?.state==='recording')return false;locked.current=true;setBusy('Сохраняю…');setError('');setMessage('');setReceipt(null);try{await operation();return true;}catch(error){if(mounted.current)setError(error instanceof ZodError?'Проверь введённые данные.':errorText(error));return false;}finally{locked.current=false;if(mounted.current)setBusy('');}}
 async function submit(kind:CaptureKind,value:string,note='',start='',end=''){return run(async()=>{
  const ai=kind==='food'||kind==='text';
  const text=ai?value.trim():`${captureLabels[kind]}: ${value.trim()}${start&&end?` ${start}–${end}`:''}${note?` · ${note}`:''}`;
  if(!text||text.length>16000)throw Error('Добавьте запись до 16 000 символов.');
  await save(text,ai?null:directCapture(kind,value,day,note,start,end),day);
 });}
 async function transcribe(value:Audio){
  return run(async()=>{
   if(value.blob.size>18_000_000)throw Error('Запись слишком большая. Максимум 18 МБ.');
   setAudio(value);
   let text=value.text;
   if(!text){setBusy('Распознаю речь…');const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Не удалось прочитать запись.'));reader.readAsDataURL(value.blob);});text=await budget(flag=>api.transcribe({base64,format:value.format,overrideBudget:flag}));if(mounted.current)setAudio({...value,text});}
   if(!mounted.current)return;
   setBusy('Разбираю запись…');await save(text,null,value.day);
  });
 }
 async function voice(){
  if(recording){recorder.current?.stop();return;}
  if(locked.current)return;
  locked.current=true;setBusy('Открываю микрофон…');
  setError('');setMessage('');
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Микрофон недоступен. Можно загрузить запись.');
   const source=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){source.getTracks().forEach(t=>t.stop());return;}
   stream.current=source;
   const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm',r=new MediaRecorder(source,{mimeType:mime}),chunks:Blob[]=[];recorder.current=r;let failed=false;
   r.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   r.onerror=()=>{failed=true;source.getTracks().forEach(t=>t.stop());if(mounted.current){setRecording(false);setError('Запись прервалась. Проверьте доступ к микрофону.');}};
   r.onstop=()=>{source.getTracks().forEach(t=>t.stop());stream.current=null;if(timer.current)clearTimeout(timer.current);if(!mounted.current)return;setRecording(false);const blob=new Blob(chunks,{type:mime});if(!failed&&blob.size)void transcribe({blob,format:'webm',day});};
   r.start();setRecording(true);timer.current=setTimeout(()=>{if(r.state==='recording')r.stop();},180000);
  }catch(error){stream.current?.getTracks().forEach(t=>t.stop());if(mounted.current){setRecording(false);setError(errorText(error));}}finally{locked.current=false;if(mounted.current)setBusy('');}
 }
 return {busy,error,message,receipt,recording,audio,submit,voice,retry:()=>audio?transcribe(audio):Promise.resolve(false),discard:()=>{setAudio(null);setError('');},clear:()=>{setError('');setMessage('');setReceipt(null);},upload:(blob:Blob,format:Audio['format'])=>transcribe({blob,format,day})};
}
