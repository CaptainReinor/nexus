package ru.nexus.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class NexusQuickWidget extends AppWidgetProvider {
  @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){
    for(int id:ids){
      RemoteViews views=new RemoteViews(context.getPackageName(),R.layout.nexus_quick_widget);
      bind(context,views,id,R.id.quick_weight,"weight");
      bind(context,views,id,R.id.quick_voice,"voice");
      bind(context,views,id,R.id.quick_expense,"expense");
      manager.updateAppWidget(id,views);
    }
  }
  private static void bind(Context context,RemoteViews views,int widgetId,int viewId,String kind){
    Intent intent=new Intent(context,MainActivity.class);
    intent.setAction("ru.nexus.mobile.QUICK");
    intent.setData(Uri.parse("nexus-widget://quick/"+widgetId+"/"+kind));
    intent.putExtra(NexusQuickPlugin.EXTRA,kind);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent action=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(viewId,action);
  }
}
