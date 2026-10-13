export async function prepareLabelPhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20_000_000)throw Error('Выберите JPG, PNG или WEBP до 20 МБ.');
 const bitmap=await createImageBitmap(file);try{
  if(bitmap.width*bitmap.height>60_000_000)throw Error('Слишком большое фото. Выберите меньший снимок.');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('Не удалось подготовить фото.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const result=canvas.toDataURL('image/jpeg',.85);if(result.length>3_000_000)throw Error('Фото слишком большое. Снимите этикетку крупнее.');return result;
 }finally{bitmap.close();}
}
