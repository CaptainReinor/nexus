package ru.nexus.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;

@CapacitorPlugin(name="NexusReminders",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class NexusRemindersPlugin extends Plugin {
  @PluginMethod public void status(PluginCall call){call.resolve(status());}
  private JSObject status(){JSObject value=new JSObject();value.put("enabled",NexusReminderReceiver.enabled(getContext()));AlarmManager alarms=(AlarmManager)getContext().getSystemService(android.content.Context.ALARM_SERVICE);value.put("exact",Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());android.os.PowerManager power=(android.os.PowerManager)getContext().getSystemService(android.content.Context.POWER_SERVICE);value.put("batteryLimited",Build.VERSION.SDK_INT>=23&&!power.isIgnoringBatteryOptimizations(getContext().getPackageName()));return value;}
  @PluginMethod public void permission(PluginCall call){if(Build.VERSION.SDK_INT>=33&&!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()&&getPermissionState("notifications")!=com.getcapacitor.PermissionState.DENIED)requestPermissionForAlias("notifications",call,"permissionResult");else {if(!NexusReminderReceiver.enabled(getContext()))openSettings("notifications");NexusReminderReceiver.restore(getContext());call.resolve(status());}}
  @PermissionCallback private void permissionResult(PluginCall call){NexusReminderReceiver.restore(getContext());call.resolve(status());}
  private void openSettings(String section){Intent intent;if("battery".equals(section)){intent=new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);}else if(Build.VERSION.SDK_INT>=26){intent=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName());}else{intent=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));}getActivity().startActivity(intent);}
  @PluginMethod public void systemSettings(PluginCall call){try{openSettings(call.getString("section","notifications"));call.resolve();}catch(Exception error){call.reject("Не удалось открыть настройки Android.");}}
  @PluginMethod public void test(PluginCall call){try{NexusReminderReceiver.test(getContext());call.resolve();}catch(Exception error){call.reject("Разреши уведомления NEXUS в настройках Android.");}}
  @PluginMethod public void precision(PluginCall call){if(Build.VERSION.SDK_INT>=31){Intent intent=new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getContext().getPackageName()));getActivity().startActivity(intent);}call.resolve();}
  @PluginMethod public void schedule(PluginCall call){try{JSONArray plan=call.getArray("plan");JSObject state=call.getObject("state");if(plan==null||state==null||plan.length()>400)throw new IllegalArgumentException();NexusReminderReceiver.replace(getContext(),plan,state);call.resolve();}catch(Exception error){call.reject("Не удалось настроить уведомления.");}}
}
