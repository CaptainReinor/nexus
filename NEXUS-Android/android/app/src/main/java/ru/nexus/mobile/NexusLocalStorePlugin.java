package ru.nexus.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="NexusLocalStore")
public class NexusLocalStorePlugin extends Plugin {
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  @Override protected void handleOnPause(){JSObject state=new JSObject();state.put("active",false);notifyListeners("appStateChange",state);}
  @Override protected void handleOnResume(){JSObject state=new JSObject();state.put("active",true);notifyListeners("appStateChange",state);}
  private AtomicFile file(String scope) throws Exception {
    if(scope==null||!scope.matches("[0-9a-f]{64}"))throw new Exception("Invalid local store scope");
    return new AtomicFile(new File(getContext().getNoBackupFilesDir(),"nexus-state-"+scope+".json"));
  }
  @PluginMethod public void read(PluginCall call){worker.execute(()->{
    try{AtomicFile storage=file(call.getString("scope"));JSObject result=new JSObject();
      if(storage.getBaseFile().exists())result.put("value",new String(storage.readFully(),StandardCharsets.UTF_8));
      else result.put("value",org.json.JSONObject.NULL);
      call.resolve(result);
    }catch(Exception error){call.reject("Не удалось прочитать данные телефона.");}
  });}
  @PluginMethod public void write(PluginCall call){worker.execute(()->{
    FileOutputStream stream=null;AtomicFile storage=null;
    try{String value=call.getString("value");if(value==null||value.length()>40000000)throw new Exception("Invalid state size");
      storage=file(call.getString("scope"));stream=storage.startWrite();stream.write(value.getBytes(StandardCharsets.UTF_8));storage.finishWrite(stream);call.resolve();
    }catch(Exception error){if(storage!=null&&stream!=null)storage.failWrite(stream);call.reject("Не удалось сохранить данные телефона.");}
  });}
}
