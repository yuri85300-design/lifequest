package dev.septgigs.neonarena.prime;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.View;
import android.graphics.Insets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebResourceError;
import android.webkit.RenderProcessGoneDetail;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class Prime231Activity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> picker;
  private String exportName, exportText;
  private static final int PICK=48, SAVE=49;
  private static final String HOST="appassets.androidplatform.net";
  private static final String URL="https://"+HOST+"/assets/www/index.html";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web=new WebView(this);
    web.setBackgroundColor(0xff081121);
    web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    // La vraie surface de jeu remplit l'écran, sans bandes système permanentes.
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    if (Build.VERSION.SDK_INT >= 28) {
      WindowManager.LayoutParams params = getWindow().getAttributes();
      params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(params);
    }
    setContentView(web);
    if (Build.VERSION.SDK_INT >= 30) {
      web.setOnApplyWindowInsetsListener((view, insets) -> {
        // Éviter la caméra, mais pas les barres de statut/navigation masquées.
        Insets cutout = insets.getInsets(WindowInsets.Type.displayCutout());
        view.setPadding(cutout.left, cutout.top, cutout.right, cutout.bottom);
        return insets;
      });
    }
    applyImmersiveMode();

    WebSettings st=web.getSettings();
    st.setJavaScriptEnabled(true);
    st.setDomStorageEnabled(true);
    st.setDatabaseEnabled(true);
    st.setAllowFileAccess(false);
    st.setAllowContentAccess(false);
    st.setAllowFileAccessFromFileURLs(false);
    st.setAllowUniversalAccessFromFileURLs(false);
    st.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.addJavascriptInterface(new Bridge(),"Native7Gigs");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        Uri uri=req.getUrl();
        if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return null;
        String path=uri.getPath();
        if (path==null || !path.startsWith("/assets/www/")) return null;
        try {
          String asset=path.substring("/assets/".length());
          if (asset.contains("..")) return null;
          InputStream stream=getAssets().open(asset);
          String mime=asset.endsWith(".html")?"text/html":asset.endsWith(".js")?"text/javascript":
                      asset.endsWith(".css")?"text/css":asset.endsWith(".webp")?"image/webp":"application/octet-stream";
          return new WebResourceResponse(mime,asset.endsWith(".html")?"UTF-8":null,stream);
        } catch(Exception ex) {
          return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("Asset introuvable".getBytes(StandardCharsets.UTF_8)));
        }
      }
      @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
        if(req != null && req.isForMainFrame()) {
          runOnUiThread(()->new AlertDialog.Builder(Prime231Activity.this)
            .setTitle("7 Gigs — chargement impossible")
            .setMessage(error==null ? "Le jeu ne peut pas être chargé." : String.valueOf(error.getDescription()))
            .setPositiveButton("Réessayer",(d,w)->view.loadUrl(URL))
            .setNegativeButton("Fermer",null).show());
        }
      }
      @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        Log.e("7Gigs-PRIME","WebView renderer stopped, crash="+detail.didCrash());
        runOnUiThread(()->new AlertDialog.Builder(Prime231Activity.this)
          .setTitle("7 Gigs — erreur d'affichage")
          .setMessage("Le moteur de rendu s'est arrêté. Relancez le jeu.")
          .setPositiveButton("Relancer",(d,w)->recreate())
          .setNegativeButton("Fermer",(d,w)->finish()).show());
        return true;
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri u=req.getUrl();
        if ("https".equals(u.getScheme()) && HOST.equals(u.getHost())) return false;
        if (req.isForMainFrame()) {
          try {startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ex){Toast.makeText(Prime231Activity.this,"Lien non accessible",Toast.LENGTH_SHORT).show();}
          return true;
        }
        return false;
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onConsoleMessage(ConsoleMessage msg){
        if(msg.messageLevel()==ConsoleMessage.MessageLevel.ERROR)
          Log.e("7Gigs-PRIME", "JS "+msg.sourceId()+":"+msg.lineNumber()+" "+msg.message());
        return super.onConsoleMessage(msg);
      }

      @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams params) {
        if (picker!=null) picker.onReceiveValue(null);
        picker=cb;
        try {
          Intent open=new Intent(Intent.ACTION_GET_CONTENT);
          open.addCategory(Intent.CATEGORY_OPENABLE);
          open.setType("*/*");
          startActivityForResult(Intent.createChooser(open,"Importer un fichier"),PICK);
        } catch(Exception e) { picker=null;cb.onReceiveValue(null); }
        return true;
      }
    });
    // Interrogation locale des 150 illustrations dans la QA Android, sans réseau.
    boolean offlineQa = getIntent()!=null && getIntent().getBooleanExtra("offlineQa",false);
    web.loadUrl(offlineQa ? URL + "?offlineQa=1" : URL);
  }
  private void applyImmersiveMode() {
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      WindowInsetsController ctrl = getWindow().getInsetsController();
      if (ctrl != null) {
        ctrl.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        ctrl.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else {
      getWindow().getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          | View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
  }
  @Override public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) applyImmersiveMode();
  }
  @Override protected void onResume() {
    super.onResume();
    applyImmersiveMode();
  }
  private class Bridge {
    @JavascriptInterface public void saveText(String filename,String text) {
      runOnUiThread(()->{
        exportName=filename.replaceAll("[^a-zA-Z0-9._-]","_");
        exportText=text;
        try {
          Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
          i.addCategory(Intent.CATEGORY_OPENABLE);
          i.setType("application/json");
          i.putExtra(Intent.EXTRA_TITLE,exportName);
          startActivityForResult(i,SAVE);
        } catch(Exception e){Toast.makeText(Prime231Activity.this,"Export impossible",Toast.LENGTH_LONG).show();}
      });
    }
    @JavascriptInterface public void openUpdates() {
      runOnUiThread(()->new AlertDialog.Builder(Prime231Activity.this)
        .setTitle("Mises à jour — 7 Gigs")
        .setMessage("Consultez la page GitHub Releases pour télécharger la dernière APK de test. Sauvegardez vos decks et votre mémoire avant d'installer une future version dotée d'une signature différente.")
        .setPositiveButton("Ouvrir GitHub",(d,w)->{
          startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/yuri85300-design/lifequest/releases")));
        }).setNegativeButton("Fermer",null).show());
    }
  }
  @Override protected void onActivityResult(int code,int result,Intent data){
    super.onActivityResult(code,result,data);
    if(code==PICK && picker!=null){
      picker.onReceiveValue(result==RESULT_OK && data!=null && data.getData()!=null?new Uri[]{data.getData()}:null);
      picker=null;
    }
    if(code==SAVE && result==RESULT_OK && data!=null && data.getData()!=null && exportText!=null){
      try (java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){
        if(out!=null) out.write(exportText.getBytes(StandardCharsets.UTF_8));
        Toast.makeText(this,"Export enregistré",Toast.LENGTH_SHORT).show();
      }catch(Exception e){Toast.makeText(this,"Erreur d'export",Toast.LENGTH_LONG).show();}
      exportText=null;
    }
  }
  @Override public void onBackPressed(){
    if(web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  @Override protected void onDestroy(){
    if(web!=null){web.removeJavascriptInterface("Native7Gigs");web.destroy();}
    super.onDestroy();
  }
}
