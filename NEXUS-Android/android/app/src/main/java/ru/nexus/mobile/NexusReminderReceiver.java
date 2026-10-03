package ru.nexus.mobile;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;

public class NexusReminderReceiver extends BroadcastReceiver {
  private static final String STORE="nexus-reminders",CHANNEL="nexus-reminders";
  private static SharedPreferences prefs(Context c){return c.getSharedPreferences(STORE,Context.MODE_PRIVATE);}
  private static PendingIntent pending(Context c,String id){Intent intent=new Intent(c,NexusReminderReceiver.class);intent.setData(Uri.parse("nexus-reminder://alarm/"+Uri.encode(id)));intent.putExtra("id",id);return PendingIntent.getBroadcast(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  public static void replace(Context c,JSONArray input,JSONObject state)throws Exception{
    AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);JSONArray old=new JSONArray(prefs(c).getString("plan","[]"));for(int i=0;i<old.length();i++)alarms.cancel(pending(c,old.getJSONObject(i).getString("ruleId")));
    JSONArray plan=new JSONArray();HashSet<String> seen=new HashSet<>();for(int i=0;i<input.length();i++){JSONObject item=input.getJSONObject(i);String id=item.getString("ruleId");if(id.length()>180||item.getString("body").length()>300||item.getString("title").length()>120||item.getLong("at")<=System.currentTimeMillis()||!seen.add(id))continue;plan.put(item);}
    if(!prefs(c).edit().putString("plan",plan.toString()).putString("state",state.toString()).commit())throw new IllegalStateException();for(int i=0;i<plan.length();i++)arm(c,plan.getJSONObject(i));
  }
  private static void arm(Context c,JSONObject item)throws Exception{AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);long at=item.getLong("at");PendingIntent intent=pending(c,item.getString("ruleId"));if(Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms())alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,intent);else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,intent);}
  private static String day(Calendar date){return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(date.getTime());}
  private static int minute(String time){String[] parts=time.split(":");return Integer.parseInt(parts[0])*60+Integer.parseInt(parts[1]);}
  private static boolean inQuiet(JSONObject state,Calendar now){if(!state.optBoolean("quiet",false))return false;int start=minute(state.optString("quietStart","22:00")),end=minute(state.optString("quietEnd","08:00")),time=now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE);return start==end|| (start<end?time>=start&&time<end:time>=start||time<end);}
  private static boolean deferQuiet(Context c,JSONObject item)throws Exception{JSONObject state=new JSONObject(prefs(c).getString("state","{}"));Calendar now=Calendar.getInstance();if(!inQuiet(state,now)||state.optString("quietStart").equals(state.optString("quietEnd")))return false;int end=minute(state.optString("quietEnd","08:00"));Calendar at=(Calendar)now.clone();at.set(Calendar.HOUR_OF_DAY,end/60);at.set(Calendar.MINUTE,end%60);at.set(Calendar.SECOND,0);at.set(Calendar.MILLISECOND,0);if(at.getTimeInMillis()<=now.getTimeInMillis())at.add(Calendar.DAY_OF_MONTH,1);item.put("at",at.getTimeInMillis());arm(c,item);return true;}
  private static boolean shouldShow(Context c,JSONObject item)throws Exception{JSONObject state=new JSONObject(prefs(c).getString("state","{}"));Calendar today=Calendar.getInstance();String date=day(today),id=item.getString("ruleId");if(id.equals("journal")){JSONArray recorded=state.optJSONArray("journalDays");if(recorded!=null)for(int i=0;i<recorded.length();i++)if(date.equals(recorded.getString(i)))return false;}
    if(id.equals("tasks")){JSONArray tasks=state.optJSONArray("tasks");if(tasks==null)return false;boolean open=false;for(int i=0;i<tasks.length();i++)if(tasks.getJSONObject(i).getString("due_day").compareTo(date)<=0&&tasks.getJSONObject(i).optString("status").equals("open")){open=true;break;}if(!open)return false;}
    if(item.optInt("habitId",0)>0&&item.optBoolean("skipCompleted",false)){JSONObject habits=state.optJSONObject("completedHabits");if(habits!=null){JSONArray done=habits.optJSONArray(String.valueOf(item.getInt("habitId")));if(done!=null)for(int i=0;i<done.length();i++)if(date.equals(done.getString(i)))return false;}}
    if(id.startsWith("care:")){JSONArray done=state.optJSONArray("completedCare");if(done!=null)for(int i=0;i<done.length();i++){JSONObject mark=done.getJSONObject(i);if(id.substring(5).equals(mark.optString("slot_id"))&&date.equals(mark.optString("day")))return false;}}
    return !inQuiet(state,today);
  }
  private static void next(Context c,JSONObject item)throws Exception{Calendar next=Calendar.getInstance();String[] parts=item.getString("time").split(":");next.set(Calendar.HOUR_OF_DAY,Integer.parseInt(parts[0]));next.set(Calendar.MINUTE,Integer.parseInt(parts[1]));next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);JSONArray days=item.getJSONArray("repeatDays");for(int attempt=0;attempt<8;attempt++){int weekday=(next.get(Calendar.DAY_OF_WEEK)+5)%7;boolean chosen=false;for(int i=0;i<days.length();i++)if(days.getInt(i)==weekday)chosen=true;if(chosen&&next.getTimeInMillis()>System.currentTimeMillis()){item.put("at",next.getTimeInMillis());arm(c,item);return;}next.add(Calendar.DAY_OF_MONTH,1);}}
  @Override public void onReceive(Context c,Intent intent){try{JSONArray plan=new JSONArray(prefs(c).getString("plan","[]"));String id=intent.getStringExtra("id");boolean rebuild=id==null;for(int i=0;i<plan.length();i++){JSONObject item=plan.getJSONObject(i);if(rebuild){next(c,item);continue;}if(!id.equals(item.getString("ruleId")))continue;if(deferQuiet(c,item))continue;long scheduled=item.getLong("at");String deliveredKey="delivered:"+id;long delivered=prefs(c).getLong(deliveredKey,0);if(scheduled>delivered&&System.currentTimeMillis()-scheduled<2*60*60*1000L&&NotificationManagerCompat.from(c).areNotificationsEnabled()&&shouldShow(c,item)){
      NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Напоминания NEXUS",NotificationManager.IMPORTANCE_DEFAULT));Intent open=new Intent(c,MainActivity.class);open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);PendingIntent action=PendingIntent.getActivity(c,id.hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);NotificationCompat.Builder note=new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(item.getString("title")).setContentText(item.getString("body")).setStyle(new NotificationCompat.BigTextStyle().bigText(item.getString("body"))).setContentIntent(action).setAutoCancel(true);manager.notify(id.hashCode(),note.build());prefs(c).edit().putLong(deliveredKey,scheduled).apply();}
      next(c,item);
    }prefs(c).edit().putString("plan",plan.toString()).apply();}catch(Exception ignored){/* Keep private record contents out of system logs. */}}
}
