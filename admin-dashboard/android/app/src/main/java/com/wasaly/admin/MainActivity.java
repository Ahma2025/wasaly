package com.wasaly.admin;

import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * زر الرجوع في أندرويد: بدل إغلاق التطبيق نسأل واجهة الويب أولاً (window.__wasalyBack)
 * لتغلق النافذة المفتوحة أو ترجع صفحة للخلف. إن لم يكن هناك ما يُغلق → نصغّر التطبيق (لا نغلقه).
 * بدون أي إضافة native جديدة (@capacitor/app غير مثبّت).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView wv = (bridge != null) ? bridge.getWebView() : null;
                if (wv == null) {
                    moveTaskToBack(true);
                    return;
                }
                wv.evaluateJavascript(
                    "(function(){try{return window.__wasalyBack?String(!!window.__wasalyBack()):'missing'}catch(e){return 'error'}})()",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            String v = value == null ? "" : value.replace("\"", "");
                            if ("true".equals(v)) return;
                            if (("missing".equals(v) || "error".equals(v)) && wv.canGoBack()) {
                                wv.goBack();
                                return;
                            }
                            moveTaskToBack(true);
                        }
                    });
            }
        });
    }
}
