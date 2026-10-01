package ru.nexus.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(android.os.Bundle savedInstanceState){
    registerPlugin(NexusAIPlugin.class);
    registerPlugin(NexusLocalStorePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
