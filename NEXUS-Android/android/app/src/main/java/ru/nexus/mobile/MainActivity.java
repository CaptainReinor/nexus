package ru.nexus.mobile;

import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(android.os.Bundle savedInstanceState){
    registerPlugin(NexusAIPlugin.class);
    registerPlugin(NexusLocalStorePlugin.class);
    registerPlugin(NexusUpdatesPlugin.class);
    registerPlugin(NexusRemindersPlugin.class);
    registerPlugin(NexusFeedbackPlugin.class);
    super.onCreate(savedInstanceState);
    getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){
      @Override public void handleOnBackPressed(){
        getBridge().getWebView().evaluateJavascript("Boolean(window.nexusCloseSurface && window.nexusCloseSurface())",result->{
          if(!"true".equals(result)){
            setEnabled(false);
            getOnBackPressedDispatcher().onBackPressed();
            setEnabled(true);
          }
        });
      }
    });
    applyTextScale();
    getWindow().getDecorView().post(this::hideStatusBar);
  }
  @Override public void onResume(){
    super.onResume();
    applyTextScale();
    getWindow().getDecorView().post(this::hideStatusBar);
  }
  @Override public void onWindowFocusChanged(boolean hasFocus){
    super.onWindowFocusChanged(hasFocus);
    if(hasFocus)hideStatusBar();
  }
  private void applyTextScale(){
    if(getBridge()!=null&&getBridge().getWebView()!=null)getBridge().getWebView().getSettings().setTextZoom(Math.round(getResources().getConfiguration().fontScale*100));
  }
  private void hideStatusBar(){
    WindowInsetsControllerCompat controller=WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView());
    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.statusBars());
  }
}
