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
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONObject;

public class PrimeUpdater254Activity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> picker;
  private String exportName, exportText;
  private static final int PICK=48, SAVE=49;
  private static final String HOST="appassets.androidplatform.net";
  private static final String URL="https://"+HOST+"/assets/www/index.html";
  // This package ID is fixed for future native Android updates. Do not change it per release.
  private static final int BASE_CONTENT_CODE = 25004;
  private static final int MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
  private static final String UPDATE_MANIFEST =
      "https://raw.githubusercontent.com/yuri85300-design/lifequest/main/updates/latest.json";
  private static final String RELEASE_BASE =
      "https://github.com/yuri85300-design/lifequest/releases/download/";
  private final ExecutorService updates = Executors.newSingleThreadExecutor();
  private volatile File currentContent;
  private volatile boolean updateCheckRunning = false;
  private SharedPreferences updatePrefs;
  private boolean otaQaRequested=false;
  private boolean uiQaRequested=false;
  private boolean otaQaStarted=false;


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
    updatePrefs = getSharedPreferences("prime_content_updates", MODE_PRIVATE);
    otaQaRequested = getIntent()!=null && getIntent().getBooleanExtra("otaQa",false);
    uiQaRequested = getIntent()!=null && getIntent().getBooleanExtra("uiQa",false);
    activatePendingOnStartup();
    Log.i("7Gigs-PRIME","ACTIVE_PRIME_CONTENT="+updatePrefs.getInt("active",BASE_CONTENT_CODE));
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        Uri uri=req.getUrl();
        if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return null;
        String path=uri.getPath();
        if (path==null || !path.startsWith("/assets/www/")) return null;
        try {
          String asset=path.substring("/assets/".length());
          if (asset.contains("..")) return null;
          // Updated HTML and AI worker come from private app storage;
          // all 150 official French images always fall back to bundled APK assets.
          File snapshot=currentContent;
          if (snapshot != null && ("www/index.html".equals(asset) || "www/ai-worker.js".equals(asset))) {
            File file=new File(snapshot,asset.substring("www/".length()));
            if (file.isFile()) {
              try {
                String mt=asset.endsWith(".html")?"text/html":"text/javascript";
                return new WebResourceResponse(mt,"UTF-8",new FileInputStream(file));
              } catch(IOException failed) {
                Log.w("7Gigs-PRIME","Updated content missing, using APK backup",failed);
              }
            }
          }
          InputStream stream=getAssets().open(asset);
          String mime=asset.endsWith(".html")?"text/html":asset.endsWith(".js")?"text/javascript":
                      asset.endsWith(".css")?"text/css":asset.endsWith(".webp")?"image/webp":"application/octet-stream";
          return new WebResourceResponse(mime,asset.endsWith(".html")?"UTF-8":null,stream);
        } catch(Exception ex) {
          return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("Asset introuvable".getBytes(StandardCharsets.UTF_8)));
        }
      }
      @Override public void onPageFinished(WebView view,String url) {
        super.onPageFinished(view,url);
        if(uiQaRequested) view.postDelayed(()->view.evaluateJavascript(
          "(function(){"+
          "const h=document.querySelector('.sim-home');"+
          "const dock=document.querySelector('.prime-update-dock');"+
          "const button=dock&&dock.querySelector('[data-prime-update]');"+
          "const css=h&&getComputedStyle(h);"+
          "const rect=dock&&dock.getBoundingClientRect();"+
          "const app=document.querySelector('#app');"+
          "const r=app&&app.getBoundingClientRect();"+
          "const checks={"+
          "screen:!!h,button:!!button,native:!!window.Native7Gigs&&typeof Native7Gigs.checkForUpdates==='function',"+
          "scroll:!!h&&css.overflowY==='auto'&&h.scrollHeight>h.clientHeight,"+
          "dock:!!rect&&!!r&&rect.bottom<=r.bottom+3&&rect.top>=r.top-3&&rect.height>45,"+
          "menu:typeof gameMenu==='function'};"+
          "console.error((Object.values(checks).every(Boolean)?'PRIME_UI_QA_PASS:':'PRIME_UI_QA_FAIL:')+JSON.stringify(checks));"+
          "})()",null),1800);
        if(!otaQaRequested)return;
        if(!otaQaStarted){
          otaQaStarted=true;
          view.evaluateJavascript("localStorage.setItem('septgigs.otaQaCanary','persisted')",value->runOtaQa());
        }else if(currentContent!=null){
          view.evaluateJavascript("localStorage.getItem('septgigs.otaQaCanary')",value->{
            if("\"persisted\"".equals(value))
              Log.i("7Gigs-PRIME","OTA_LOCAL_SAVE_QA_PASS");
            else Log.e("7Gigs-PRIME","OTA_LOCAL_SAVE_QA_FAIL:"+value);
          });
        }
      }
      @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
        if(req != null && req.isForMainFrame()) {
          runOnUiThread(()->new AlertDialog.Builder(PrimeUpdater254Activity.this)
            .setTitle("7 Gigs — chargement impossible")
            .setMessage(error==null ? "Le jeu ne peut pas être chargé." : String.valueOf(error.getDescription()))
            .setPositiveButton("Réessayer",(d,w)->view.loadUrl(URL))
            .setNegativeButton("Fermer",null).show());
        }
      }
      @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        Log.e("7Gigs-PRIME","WebView renderer stopped, crash="+detail.didCrash());
        runOnUiThread(()->new AlertDialog.Builder(PrimeUpdater254Activity.this)
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
          try {startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ex){Toast.makeText(PrimeUpdater254Activity.this,"Lien non accessible",Toast.LENGTH_SHORT).show();}
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

  private File contentRoot() {
    File root=new File(getFilesDir(),"prime-content");
    if (!root.isDirectory() && !root.mkdirs()) Log.w("7Gigs-PRIME","Cannot create update directory");
    return root;
  }

  private File completeBundle(int version) {
    File versionDir=new File(contentRoot(),"v"+version);
    File html=new File(versionDir,"index.html");
    File worker=new File(versionDir,"ai-worker.js");
    return html.isFile() && worker.isFile() && html.length()>200000 && worker.length()>100000
        ? versionDir : null;
  }

  private void activatePendingOnStartup() {
    int pending=updatePrefs.getInt("pending",0);
    if (pending>BASE_CONTENT_CODE && completeBundle(pending)!=null) {
      updatePrefs.edit().putInt("active",pending).remove("pending").commit();
    }
    int active=updatePrefs.getInt("active",BASE_CONTENT_CODE);
    currentContent=active>BASE_CONTENT_CODE?completeBundle(active):null;
    if (active>BASE_CONTENT_CODE && currentContent==null) {
      updatePrefs.edit().putInt("active",BASE_CONTENT_CODE).remove("pending").commit();
    }
  }

  private byte[] readLimited(String url,int maxBytes) throws Exception {
    HttpURLConnection conn=(HttpURLConnection)new URL(url).openConnection();
    conn.setConnectTimeout(16000);
    conn.setReadTimeout(25000);
    conn.setRequestProperty("User-Agent","7Gigs-PRIME-Updater/1.0");
    conn.setRequestProperty("Accept","application/json, application/zip, */*");
    try {
      if (conn.getResponseCode()!=200) throw new IOException("HTTP "+conn.getResponseCode());
      try (InputStream in=conn.getInputStream();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()) {
        byte[] buf=new byte[8192];int n;
        while((n=in.read(buf))!=-1){
          if(out.size()+n>maxBytes) throw new IOException("Mise à jour trop volumineuse");
          out.write(buf,0,n);
        }
        return out.toByteArray();
      }
    } finally {conn.disconnect();}
  }

  private static String sha256(byte[] data) throws Exception {
    byte[] hash=MessageDigest.getInstance("SHA-256").digest(data);
    StringBuilder b=new StringBuilder();
    for(byte d:hash)b.append(String.format(Locale.US,"%02x",d&255));
    return b.toString();
  }

  private void installBundle(byte[] zipped,int code) throws Exception {
    File root=contentRoot();
    File staging=new File(root,"pending-"+code);
    deleteDirectory(staging);
    if(!staging.mkdirs())throw new IOException("Espace de stockage indisponible");
    Set<String> seen=new HashSet<>();
    int total=0;
    try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(zipped))) {
      ZipEntry entry;
      while((entry=zip.getNextEntry())!=null){
        String name=entry.getName();
        if(!("index.html".equals(name) || "ai-worker.js".equals(name)) || !seen.add(name) || entry.isDirectory())
          throw new IOException("Archive non autorisée");
        File dest=new File(staging,name);
        int len=0;
        try(OutputStream out=new FileOutputStream(dest)){
          byte[] buf=new byte[8192];int n;
          while((n=zip.read(buf))!=-1){
            len+=n;total+=n;
            if(len>2600000 || total>5000000)throw new IOException("Contenu décompressé trop volumineux");
            out.write(buf,0,n);
          }
        }
        zip.closeEntry();
      }
    } catch(Exception e){deleteDirectory(staging);throw e;}
    if(seen.size()!=2 || !seen.contains("index.html") || !seen.contains("ai-worker.js")){
      deleteDirectory(staging);throw new IOException("Archive incomplète");
    }
    byte[] html=java.nio.file.Files.readAllBytes(new File(staging,"index.html").toPath());
    byte[] worker=java.nio.file.Files.readAllBytes(new File(staging,"ai-worker.js").toPath());
    String h=new String(html,StandardCharsets.UTF_8),w=new String(worker,StandardCharsets.UTF_8);
    if(h.length()<350000 || !h.contains("const LOCAL_FR_ART") || !h.contains("TacticalWorker")
      || w.length()<150000 || !w.contains("self.onmessage")){
      deleteDirectory(staging);throw new IOException("Le paquet ne contient pas le moteur attendu");
    }
    File target=new File(root,"v"+code);
    deleteDirectory(target);
    if(!staging.renameTo(target)){deleteDirectory(staging);throw new IOException("Activation impossible");}
    // The active version changes only after all validations complete. Existing saves stay untouched.
    if(!updatePrefs.edit().putInt("pending",code).commit())
      throw new IOException("Impossible de mémoriser la version");
  }

  private void deleteDirectory(File file) {
    if(file.isDirectory()) {
      File[] children=file.listFiles();
      if(children!=null)for(File c:children)deleteDirectory(c);
    }
    if(file.exists() && !file.delete())Log.w("7Gigs-PRIME","Could not delete "+file.getName());
  }

  private void showUpdateError(Exception e) {
    runOnUiThread(()->new AlertDialog.Builder(PrimeUpdater254Activity.this)
       .setTitle("Mise à jour indisponible")
       .setMessage("Le jeu installé reste utilisable sans Internet.\n\n"+e.getMessage())
       .setPositiveButton("OK",null).show());
  }

  private void checkForContentUpdate() {
    if(updateCheckRunning)return;
    updateCheckRunning=true;
    runOnUiThread(()->Toast.makeText(this,"Vérification GitHub…",Toast.LENGTH_SHORT).show());
    updates.execute(()->{
      try {
        byte[] m=readLimited(UPDATE_MANIFEST+"?check="+System.currentTimeMillis(),65536);
        JSONObject manifest=new JSONObject(new String(m,StandardCharsets.UTF_8));
        int code=manifest.getInt("version_code");
        int minShell=manifest.optInt("min_shell",BASE_CONTENT_CODE);
        String version=manifest.getString("version");
        String location=manifest.getString("url");
        String hash=manifest.getString("sha256").toLowerCase(Locale.ROOT);
        if(!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")
          || !location.equals(RELEASE_BASE+"prime-content-v"+version+"/prime-content-v"+version+".zip")
          || !hash.matches("[a-f0-9]{64}"))
          throw new SecurityException("Manifeste de publication non conforme");
        if(minShell>BASE_CONTENT_CODE) {
          runOnUiThread(()->new AlertDialog.Builder(this).setTitle("Mise à jour Android requise")
            .setMessage("Cette mise à jour nécessite une nouvelle version du lanceur Android. Les données restent conservées si l'APK est signé avec la même clé.")
            .setPositiveButton("Ouvrir GitHub", (d,w)->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/yuri85300-design/lifequest/releases"))))
            .setNegativeButton("Plus tard",null).show());
          return;
        }
        int installed=Math.max(BASE_CONTENT_CODE,updatePrefs.getInt("active",BASE_CONTENT_CODE));
        installed=Math.max(installed,updatePrefs.getInt("pending",0));
        final int installedFinal=installed;
        if(code<=installed) {
          runOnUiThread(()->new AlertDialog.Builder(this).setTitle("PRIME est à jour")
            .setMessage("Version du jeu : "+(installedFinal==BASE_CONTENT_CODE?"2.5.4":String.valueOf(installedFinal))+
               "\nLes 150 images françaises restent disponibles hors connexion.")
            .setPositiveButton("OK",null)
            .setNeutralButton("Réparer le jeu",(d,w)->restoreBundledVersion()).show());
          return;
        }
        if(code<BASE_CONTENT_CODE)throw new IOException("Version obsolète reçue");
        runOnUiThread(()->new AlertDialog.Builder(this)
          .setTitle("Nouvelle mise à jour PRIME "+version)
          .setMessage("Télécharger les nouvelles règles, l'interface et l'IA depuis GitHub ?\n\n"
            +"Les 150 illustrations françaises et vos sauvegardes restent sur ce téléphone.")
          .setPositiveButton("Télécharger",(d,w)->downloadAndStage(code,location,hash))
          .setNegativeButton("Plus tard",null).show());
      } catch(Exception e){showUpdateError(e);}
      finally{updateCheckRunning=false;}
    });
  }

  private void downloadAndStage(int code,String location,String expected) {
    Toast.makeText(this,"Téléchargement GitHub…",Toast.LENGTH_SHORT).show();
    updates.execute(()->{
      try {
        byte[] zip=readLimited(location,MAX_BUNDLE_BYTES);
        if(!sha256(zip).equals(expected))throw new SecurityException("Empreinte SHA-256 incorrecte");
        installBundle(zip,code);
        runOnUiThread(()->new AlertDialog.Builder(this)
          .setTitle("Mise à jour téléchargée")
          .setMessage("Nouvelles données du jeu vérifiées. La progression et les illustrations VF sont conservées.\n"
            +"Si un duel est ouvert, il sera repris depuis son dernier point de sauvegarde.")
          .setPositiveButton("Activer et relancer",(d,w)->{
            activatePendingOnStartup();
            web.loadUrl(URL);
          })
          .setNegativeButton("Au prochain lancement",null).show());
      }catch(Exception e){showUpdateError(e);}
    });
  }

  private void restoreBundledVersion() {
    updatePrefs.edit().putInt("active",BASE_CONTENT_CODE).remove("pending").commit();
    currentContent=null;
    web.loadUrl(URL);
    Toast.makeText(this,"Version de secours rétablie, sauvegardes conservées.",Toast.LENGTH_LONG).show();
  }


  // The test run supplies otaQa=true via adb; never uses arbitrary remote URLs.
  // This validates the same staging path as the user-initiated updater.
  private void runOtaQa(){
    updates.execute(()->{
      try{
        JSONObject m=new JSONObject(new String(readLimited(UPDATE_MANIFEST+"?qa="+System.currentTimeMillis(),65536),StandardCharsets.UTF_8));
        int code=m.getInt("version_code");
        String version=m.getString("version");
        String expectedUrl=RELEASE_BASE+"prime-content-v"+version+"/prime-content-v"+version+".zip";
        if(code<=BASE_CONTENT_CODE || m.optInt("min_shell",BASE_CONTENT_CODE)>BASE_CONTENT_CODE
          || !expectedUrl.equals(m.getString("url")))throw new SecurityException("OTA test manifest invalid");
        byte[] zip=readLimited(expectedUrl,MAX_BUNDLE_BYTES);
        if(!sha256(zip).equals(m.getString("sha256")))throw new SecurityException("OTA SHA mismatch");
        installBundle(zip,code);
        activatePendingOnStartup();
        Log.i("7Gigs-PRIME","PRIME_OTA_QA_PASS:"+code);
        runOnUiThread(()->web.loadUrl(URL+"?offlineQa=1"));
      }catch(Exception e){Log.e("7Gigs-PRIME","PRIME_OTA_QA_FAIL",e);}
    });
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
        } catch(Exception e){Toast.makeText(PrimeUpdater254Activity.this,"Export impossible",Toast.LENGTH_LONG).show();}
      });
    }
    @JavascriptInterface public void checkForUpdates() {
      runOnUiThread(()->checkForContentUpdate());
    }
    @JavascriptInterface public void openUpdates() { checkForUpdates(); }
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
    updates.shutdownNow();
    super.onDestroy();
  }
}
