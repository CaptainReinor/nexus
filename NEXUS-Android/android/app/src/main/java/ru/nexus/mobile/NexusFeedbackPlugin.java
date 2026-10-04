package ru.nexus.mobile;

import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="NexusFeedback")
public class NexusFeedbackPlugin extends Plugin {
  @PluginMethod public void pulse(PluginCall call){
    getActivity().runOnUiThread(()->{
      if(Settings.System.getInt(getContext().getContentResolver(),Settings.System.HAPTIC_FEEDBACK_ENABLED,1)!=0){
        View view=getBridge().getWebView();
        if(view.isHapticFeedbackEnabled())view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
      }
      call.resolve();
    });
  }
}
