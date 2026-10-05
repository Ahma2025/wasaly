package com.wasaly.restaurant;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
    }

    /**
     * Android 15+ (targetSdk ≥ 35) يفرض وضع edge-to-edge، وWebView في Capacitor 5 لا يعطي
     * env(safe-area-inset-*) صحيحة، فيصير الهيدر تحت شريط الحالة والقائمة السفلية تحت شريط الإيماءات.
     * الحل: نضيف padding بقيمة أشرطة النظام (والكيبورد) حول محتوى التطبيق، ونلوّن منطقة شريط الحالة بلون العلامة.
     * (windowOptOutEdgeToEdgeEnforcement غير ممكن هنا لأن compileSdk 34 لا يعرف هذه الخاصية، ويُتجاهل مع targetSdk 36.)
     */
    private void applySystemBarInsets() {
        if (Build.VERSION.SDK_INT < 35) return;
        final View content = findViewById(android.R.id.content);
        if (content == null) return;

        final LayerDrawable bg = new LayerDrawable(new Drawable[] {
            new ColorDrawable(Color.WHITE),
            new ColorDrawable(Color.parseColor("#FF7A12"))
        });
        bg.setLayerGravity(1, Gravity.TOP | Gravity.FILL_HORIZONTAL);
        bg.setLayerHeight(1, 0);
        content.setBackground(bg);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(true);

        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            bg.setLayerHeight(1, bars.top);
            bg.invalidateSelf();
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
