package com.sevengigs.prime;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int EXPORT_DOCUMENT = 230;
    private WebView web;
    private String exportText;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(0xFF030A18);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(), "Native7Gigs");
        setContentView(web);
        immersive();
        web.loadUrl("file:///android_asset/prime_v220_runtime.html");
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immersive();
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if(web != null) { web.removeJavascriptInterface("Native7Gigs");web.destroy(); }
        super.onDestroy();
    }

    private final class Bridge {
        @JavascriptInterface public void openUpdates() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(
                    "https://github.com/yuri85300-design/lifequest/releases"));
                try { startActivity(intent); }
                catch (Exception ignored) {}
            });
        }
        @JavascriptInterface public void saveText(String name, String text) {
            runOnUiThread(() -> {
                exportText = text;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[\\\\/]", "_"));
                try { startActivityForResult(intent, EXPORT_DOCUMENT); }
                catch (Exception ignored) { exportText = null; }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if(request != EXPORT_DOCUMENT) return;
        if(result == RESULT_OK && data != null && data.getData() != null && exportText != null) {
            try (java.io.OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if(out != null) out.write(exportText.getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) {}
        }
        exportText = null;
    }
}
