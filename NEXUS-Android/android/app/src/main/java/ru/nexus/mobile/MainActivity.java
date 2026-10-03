package ru.nexus.mobile;

import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(android.os.Bundle savedInstanceState){
    registerPlugin(NexusAIPlugin.class);
    registerPlugin(NexusLocalStorePlugin.class);
    registerPlugin(NexusUpdatesPlugin.class);
    super.onCreate(savedInstanceState);
    getWindow().getDecorView().post(this::hideStatusBar);
  }
  @Override public void onResume(){
    super.onResume();
    getWindow().getDecorView().post(this::hideStatusBar);
  }
  @Override public void onWindowFocusChanged(boolean hasFocus){
    super.onWindowFocusChanged(hasFocus);
    if(hasFocus)hideStatusBar();
  }
  private void hideStatusBar(){
    WindowInsetsControllerCompat controller=WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView());
    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.statusBars());
  }
}
