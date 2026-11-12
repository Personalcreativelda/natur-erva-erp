package mz.co.naturerva.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locais têm de ser registados antes de super.onCreate
        registerPlugin(NaturPrintPlugin.class);
        super.onCreate(savedInstanceState);
        setupDownloads();
    }

    /**
     * Transferências de ficheiros por URL http(s) (ex.: anexos, documentos no armazenamento) —
     * a WebView ignora-as por omissão. Vão para a pasta Transferências com notificação do sistema.
     * Ficheiros gerados no browser (blob:, PDF/Excel exportados) são tratados pelo site através
     * dos plugins Filesystem + Share (ver front/modules/core/mobile/nativeFiles.ts).
     */
    private void setupDownloads() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.addRequestHeader("User-Agent", userAgent);
                request.setTitle(fileName);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(request);
                    Toast.makeText(this, "A transferir " + fileName, Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível transferir o ficheiro", Toast.LENGTH_LONG).show();
            }
        });
    }
}
