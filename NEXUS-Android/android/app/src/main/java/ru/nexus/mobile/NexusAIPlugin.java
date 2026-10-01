package ru.nexus.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

@CapacitorPlugin(name="NexusAI")
public class NexusAIPlugin extends Plugin {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();

    private JSONObject request(String address, String token, JSONObject body) throws Exception {
        URL url=new URL(address);
        if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null)throw new Exception("Нужен безопасный адрес HTTPS.");
        HttpURLConnection conn=(HttpURLConnection)url.openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(20000);conn.setReadTimeout(110000);
        conn.setRequestProperty("Authorization","Bearer "+token);
        conn.setRequestProperty("User-Agent","NEXUS-Android/0.2.6");
        conn.setRequestProperty("X-Title","NEXUS");
        try {
            if(body!=null){
                conn.setRequestMethod("POST");conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type","application/json");
                byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(bytes.length);
                try(java.io.OutputStream stream=conn.getOutputStream()){stream.write(bytes);}
            }
            int status=conn.getResponseCode();
            InputStream input=status>=400?conn.getErrorStream():conn.getInputStream();
            String text="";
            if(input!=null){try(InputStream stream=input){java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();byte[] chunk=new byte[8192];int count;while((count=stream.read(chunk))!=-1){if(output.size()+count>32000000)throw new Exception("Ответ AI слишком большой.");output.write(chunk,0,count);}text=output.toString("UTF-8");}}
            JSONObject result;
            try{result=new JSONObject(text);}catch(Exception error){result=new JSONObject();}
            if(status>=400||result.has("error")){
                if("shared_audio_unavailable".equals(result.optString("error")))throw new Exception("Голосовой AI для приглашённых пользователей пока недоступен. Используйте текст или диктовку клавиатуры.");
                if("ai_budget_exceeded".equals(result.optString("error")))throw new Exception("Исчерпан месячный лимит общего AI.");
                JSONObject details=result.optJSONObject("error");
                int code=details!=null?details.optInt("code",status):status;
                String message=details!=null?details.optString("message",""):"";
                if(address.endsWith("/device-key")){
                    if(status==404)throw new Exception("Обновите AI-службу на VPS: она ещё не поддерживает подключение телефона к OpenRouter.");
                    if(status==409)throw new Exception("Ключ AI для этого профиля ещё не выдан. Обратитесь к владельцу NEXUS.");
                    if(status==401||status==403)throw new Exception("Сервер не принял ключ доступа телефона.");
                }
                String description=code==401?"OpenRouter отклонил API-ключ.":code==402?"Не хватает средств на OpenRouter или лимита API-ключа.":code==403?"OpenRouter запретил запрос с этой сети. Проверьте доступ к OpenRouter на телефоне.":code==429?"OpenRouter ограничил запросы. Повторите позже.":code==404?"Выбранная модель OpenRouter недоступна.":code==400?"OpenRouter отклонил параметры выбранной модели.":"OpenRouter ответил с ошибкой "+code+".";
                // Do not include native headers, key or provider echo in the WebView error.
                throw new Exception(description+(message.isEmpty()?"":" "+message.replace(token,"[скрыто]").substring(0,Math.min(250,message.replace(token,"[скрыто]").length()))));
            }
            return result;
        }finally{conn.disconnect();}
    }

    @PluginMethod
    public void check(PluginCall call){
        worker.execute(()->{
            try{
                String endpoint=call.getString("endpoint","").replaceAll("/+$","");
                JSONObject credentials=request(endpoint+"/v1/ai/device-key",call.getString("token",""),null);
                request("https://openrouter.ai/api/v1/key",credentials.getString("key"),null);
                JSObject result=new JSObject();result.put("configured",true);call.resolve(result);
            }catch(java.io.IOException error){call.reject("Нет связи телефона с OpenRouter. Проверьте доступ к сервису из вашей сети.");}
            catch(Exception error){call.reject(error.getMessage());}
        });
    }

    @PluginMethod
    public void run(PluginCall call){
        worker.execute(()->{
            try{
                String endpoint=call.getString("endpoint","").replaceAll("/+$","");
                String serverToken=call.getString("token","");
                JSONObject credentials=request(endpoint+"/v1/ai/device-key",serverToken,null);
                String key=credentials.getString("key");
                String mode=call.getString("mode","complete");
                JSONObject body=new JSONObject();body.put("model",call.getString("model",""));
                String path;
                if(mode.equals("transcribe")){
                    path="audio/transcriptions";
                    body.put("input_audio",new JSONObject().put("data",call.getString("base64","")).put("format",call.getString("format","")));
                    body.put("language","ru");
                }else{
                    path="chat/completions";
                    JSONArray messages=new JSONArray();
                    messages.put(new JSONObject().put("role","system").put("content",call.getString("system","")));
                    messages.put(new JSONObject().put("role","user").put("content",call.getString("user","")));
                    body.put("messages",messages);body.put("max_tokens",6000);body.put("stream",false);
                    if(call.getString("model","").equals("deepseek/deepseek-v3.2"))body.put("reasoning",new JSONObject().put("enabled",false));
                    body.put("usage",new JSONObject().put("include",true));
                    if(call.getBoolean("structured",false)){
                        JSObject format=call.getObject("responseFormat");
                        body.put("response_format",format!=null?format:new JSONObject().put("type","json_object"));
                        if(format!=null)body.put("provider",new JSONObject().put("require_parameters",true));
                    }
                }
                JSONObject response=request("https://openrouter.ai/api/v1/"+path,key,body);
                String content=mode.equals("transcribe")?response.optString("text",""):response.optJSONArray("choices")!=null&&response.getJSONArray("choices").length()>0?response.getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content",""):"";
                if(content.trim().isEmpty())throw new Exception("OpenRouter вернул пустой ответ. Попробуйте другую модель.");
                JSONObject usage=response.optJSONObject("usage");
                JSObject reply=new JSObject();reply.put("content",content);reply.put("requestId",response.optString("id",""));
                String input=mode.equals("transcribe")?"input_tokens":"prompt_tokens",output=mode.equals("transcribe")?"output_tokens":"completion_tokens";
                reply.put("inputTokens",usage!=null&&usage.has(input)?usage.get(input):JSONObject.NULL);
                reply.put("outputTokens",usage!=null&&usage.has(output)?usage.get(output):JSONObject.NULL);
                reply.put("costMicrousd",usage!=null&&usage.has("cost")&&!usage.isNull("cost")?Math.round(usage.getDouble("cost")*1000000):JSONObject.NULL);
                call.resolve(reply);
            }catch(java.net.SocketTimeoutException error){call.reject("OpenRouter не ответил вовремя. Повторите запрос позже.");}
            catch(java.io.IOException error){call.reject("Телефон не может подключиться к OpenRouter. Проверьте интернет и доступ к сервису из вашей сети.");}
            catch(Exception error){call.reject(error.getMessage()==null?"Не удалось получить ответ OpenRouter.":error.getMessage());}
        });
    }
}
