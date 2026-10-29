package it.swimforge.app;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge on every Android version (enforced from Android 15 with targetSdk 35+):
        // transparent status and navigation bars, without the contrast scrim Android adds behind
        // the 3-button navigation. The WebView draws under them (viewport-fit=cover in the native
        // build) and pads the header and the bottom navigation with env(safe-area-inset-*), so
        // the bars show the app's own colours. Icon colours follow the app theme
        // (Capacitor SystemBars, client/src/lib/native-runtime.ts).
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
    }
}
