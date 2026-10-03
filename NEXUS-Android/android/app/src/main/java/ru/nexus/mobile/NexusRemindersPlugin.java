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
  private JSObject status(){JSObject value=new JSObject();value.put("enabled",NotificationManagerCompat.from(getContext()).areNotificationsEnabled());AlarmManager alarms=(AlarmManager)getContext().getSystemService(android.content.Context.ALARM_SERVICE);value.put("exact",Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());return value;}
  @PluginMethod public void permission(PluginCall call){if(Build.VERSION.SDK_INT>=33&&!NotificationManagerCompat.from(getContext()).areNotificationsEnabled())requestPermissionForAlias("notifications",call,"permissionResult");else call.resolve(status());}
  @PermissionCallback private void permissionResult(PluginCall call){call.resolve(status());}
  @PluginMethod public void precision(PluginCall call){if(Build.VERSION.SDK_INT>=31){Intent intent=new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getContext().getPackageName()));getActivity().startActivity(intent);}call.resolve();}
  @PluginMethod public void schedule(PluginCall call){try{JSONArray plan=call.getArray("plan");JSObject state=call.getObject("state");if(plan==null||state==null||plan.length()>400)throw new IllegalArgumentException();NexusReminderReceiver.replace(getContext(),plan,state);call.resolve();}catch(Exception error){call.reject("Не удалось настроить уведомления.");}}
}
