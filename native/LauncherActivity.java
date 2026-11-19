package dev.septgigs.neonarena;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class LauncherActivity extends Activity {
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
    setContentView(web);
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
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri u=req.getUrl();
        if ("https".equals(u.getScheme()) && HOST.equals(u.getHost())) return false;
        if (req.isForMainFrame()) {
          try {startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ex){Toast.makeText(LauncherActivity.this,"Lien non accessible",Toast.LENGTH_SHORT).show();}
          return true;
        }
        return false;
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
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
    web.loadUrl(URL);
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
        } catch(Exception e){Toast.makeText(LauncherActivity.this,"Export impossible",Toast.LENGTH_LONG).show();}
      });
    }
    @JavascriptInterface public void openUpdates() {
      runOnUiThread(()->new AlertDialog.Builder(LauncherActivity.this)
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
