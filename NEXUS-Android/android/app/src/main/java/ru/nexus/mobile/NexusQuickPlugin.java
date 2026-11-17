package ru.nexus.mobile;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="NexusQuick")
public class NexusQuickPlugin extends Plugin {
  static final String EXTRA="nexus_quick_kind";
  private static String kind(Intent intent){
    if(intent==null)return null;
    String value=intent.getStringExtra(EXTRA);
    return "weight".equals(value)||"voice".equals(value)||"expense".equals(value)||"text".equals(value)?value:null;
  }
  @Override protected void handleOnNewIntent(Intent intent){
    getActivity().setIntent(intent);
    String value=kind(intent);
    if(value!=null&&hasListeners("quickAction")){
      intent.removeExtra(EXTRA);
      notifyListeners("quickAction",new JSObject().put("kind",value));
    }
  }
  @PluginMethod public void consume(PluginCall call){
    getActivity().runOnUiThread(()->{
      Intent intent=getActivity().getIntent();String value=kind(intent);
      if(intent!=null)intent.removeExtra(EXTRA);
      call.resolve(new JSObject().put("kind",value));
    });
  }
  @PluginMethod public void pin(PluginCall call){
    getActivity().runOnUiThread(()->{
      AppWidgetManager manager=AppWidgetManager.getInstance(getContext());
      boolean supported=Build.VERSION.SDK_INT>=26&&manager.isRequestPinAppWidgetSupported();
      boolean requested=supported&&manager.requestPinAppWidget(new ComponentName(getContext(),NexusQuickWidget.class),null,null);
      call.resolve(new JSObject().put("requested",requested));
    });
  }
}
