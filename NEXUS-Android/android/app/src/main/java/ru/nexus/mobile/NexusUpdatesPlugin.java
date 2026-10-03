package ru.nexus.mobile;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.provider.Settings;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name="NexusUpdates")
public class NexusUpdatesPlugin extends Plugin {
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private volatile String phase="idle",version="",message="";
  private volatile int percent=0;
  private String assetUrl="",digest="";
  private long expectedSize=0;
  private static final long MAX_APK=64L*1024*1024;
  private static final String PREFIX="https://github.com/CaptainReinor/nexus/releases/download/";
  @SuppressWarnings("deprecation")
  private int signatureFlags(){return Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;}
  private PackageInfo own() throws Exception{return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),signatureFlags());}
  @SuppressWarnings("deprecation")
  private long code(PackageInfo info){return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;}
  @SuppressWarnings("deprecation")
  private Signature[] signers(PackageInfo info){return Build.VERSION.SDK_INT>=28?(info.signingInfo==null?new Signature[0]:info.signingInfo.getApkContentsSigners()):(info.signatures==null?new Signature[0]:info.signatures);}
  private File apk(){return new File(new File(getContext().getCacheDir(),"updates"),"nexus-update.apk");}
  private JSObject state(){JSObject value=new JSObject();value.put("phase",phase);try{value.put("currentVersion",own().versionName);}catch(Exception ignored){value.put("currentVersion","");}if(!version.isEmpty())value.put("version",version);value.put("percent",percent);if(!message.isEmpty())value.put("message",message);return value;}
  @PluginMethod public void status(PluginCall call){call.resolve(state());}
  private static int compare(String left,String right){String[] a=left.split("\\."),b=right.split("\\.");for(int i=0;i<3;i++){int delta=Integer.parseInt(a[i])-Integer.parseInt(b[i]);if(delta!=0)return delta;}return 0;}
  private HttpURLConnection connect(String address,boolean redirects) throws Exception{
    HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(redirects);c.setRequestProperty("User-Agent","NEXUS-updater");c.setRequestProperty("Accept","application/vnd.github+json");
    if(c.getResponseCode()!=200){c.disconnect();throw new Exception("HTTP error");}return c;
  }
  @PluginMethod public void check(PluginCall call){worker.execute(()->{
    if(phase.equals("ready")||phase.equals("downloading")){call.resolve(state());return;}
    phase="checking";message="";
    try{
      HttpURLConnection c=connect("https://api.github.com/repos/CaptainReinor/nexus/releases/latest",false);
      JSONObject release;
      try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
        byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1){out.write(bytes,0,n);if(out.size()>1024*1024)throw new Exception("Release too large");}release=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
      }finally{c.disconnect();}
      if(release.optBoolean("draft")||release.optBoolean("prerelease"))throw new Exception("Unpublished release");
      phase="current";version="";assetUrl="";digest="";expectedSize=0;
      JSONArray assets=release.getJSONArray("assets");
      for(int i=0;i<assets.length();i++){
        JSONObject asset=assets.getJSONObject(i);String name=asset.optString("name");
        if(!name.matches("NEXUS-\\d+\\.\\d+\\.\\d+\\.apk"))continue;
        String candidate=name.substring(6,name.length()-4);if(compare(candidate,own().versionName)<=0)continue;
        String address=asset.optString("browser_download_url"),hash=asset.optString("digest");long size=asset.optLong("size");
        if(!address.startsWith(PREFIX)||!address.endsWith("/"+name)||!hash.matches("sha256:[0-9a-f]{64}")||size<=0||size>MAX_APK)throw new Exception("Invalid update asset");
        if(version.isEmpty()||compare(candidate,version)>0){version=candidate;assetUrl=address;digest=hash.substring(7);expectedSize=size;phase="available";}
      }
    }catch(Exception error){phase="error";message="Не удалось проверить обновления. Проверьте интернет.";}
    call.resolve(state());
  });}
  private static String hex(byte[] value){StringBuilder result=new StringBuilder();for(byte b:value)result.append(String.format("%02x",b&255));return result.toString();}
  private void verify(File file) throws Exception{
    if(file.length()!=expectedSize)throw new Exception("Wrong update size");
    MessageDigest sha=MessageDigest.getInstance("SHA-256");try(InputStream in=new java.io.FileInputStream(file)){byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)sha.update(bytes,0,n);}
    if(!hex(sha.digest()).equals(digest))throw new Exception("Checksum mismatch");
    PackageInfo info=getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(),signatureFlags()),current=own();
    if(info==null||!getContext().getPackageName().equals(info.packageName)||code(info)<=code(current)||!version.equals(info.versionName))throw new Exception("Wrong package or version");
    Signature[] a=signers(info),b=signers(current);
    if(a.length!=b.length||a.length==0)throw new Exception("Wrong signer");
    for(Signature signer:a)if(Arrays.stream(b).noneMatch(other->other.equals(signer)))throw new Exception("Wrong signer");
  }
  @PluginMethod public void download(PluginCall call){worker.execute(()->{
    if(phase.equals("ready")){call.resolve(state());return;}
    if(!phase.equals("available")){call.reject("Сначала проверьте обновления.");return;}
    phase="downloading";percent=0;message="";File file=apk();File part=new File(file.getParentFile(),"download.part");
    try{
      if(!file.getParentFile().isDirectory()&&!file.getParentFile().mkdirs())throw new Exception("No storage");
      HttpURLConnection c=connect(assetUrl,true);
      try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(part)){
        byte[] bytes=new byte[16384];long total=0;int n;while((n=in.read(bytes))!=-1){total+=n;if(total>expectedSize||total>MAX_APK)throw new Exception("Wrong size");out.write(bytes,0,n);percent=(int)(total*100/expectedSize);}out.getFD().sync();
      }finally{c.disconnect();}
      verify(part);if(file.exists()&&!file.delete())throw new Exception("Cannot replace");if(!part.renameTo(file))throw new Exception("Cannot save");phase="ready";percent=100;
    }catch(Exception error){part.delete();phase="error";message="Не удалось скачать или проверить обновление. Попробуйте ещё раз.";}
    call.resolve(state());
  });}
  @PluginMethod public void install(PluginCall call){worker.execute(()->{
    try{
      if(!phase.equals("ready"))throw new Exception("Not ready");verify(apk());
      if(Build.VERSION.SDK_INT>=26&&!getContext().getPackageManager().canRequestPackageInstalls()){
        getActivity().runOnUiThread(()->getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getContext().getPackageName()))));
        call.reject("Разрешите установку обновлений для NEXUS, затем нажмите «Установить» ещё раз.");return;
      }
      File backups=new File(getContext().getNoBackupFilesDir(),"before-update");
      if(!backups.isDirectory()&&!backups.mkdirs())throw new Exception("No backup storage");
      File[] states=getContext().getNoBackupFilesDir().listFiles((dir,name)->name.matches("nexus-state-[0-9a-f]{64}\\.json"));
      if(states!=null)for(File state:states){try(InputStream in=new java.io.FileInputStream(state);FileOutputStream out=new FileOutputStream(new File(backups,state.getName()))){byte[] bytes=new byte[16384];int count;while((count=in.read(bytes))!=-1)out.write(bytes,0,count);out.getFD().sync();}}
      Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",apk());
      getActivity().runOnUiThread(()->{try{Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(uri,"application/vnd.android.package-archive");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);getActivity().startActivity(intent);call.resolve();}catch(Exception error){call.reject("Не удалось открыть установку обновления.");}});
    }catch(Exception error){phase="error";message="Не удалось подготовить обновление. Проверьте свободное место и скачайте его заново.";call.reject(message);}
  });}
  @Override protected void handleOnDestroy(){worker.shutdown();}
}
