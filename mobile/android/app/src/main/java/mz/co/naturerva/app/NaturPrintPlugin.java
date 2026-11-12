package mz.co.naturerva.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Impressão nativa para a app (a WebView do Android não suporta window.print() nem pop-ups).
 *
 * O site gera recibos/faturas/etiquetas como HTML (window.open + document.write). Na app esse
 * HTML chega aqui: é carregado numa WebView invisível e enviado ao PrintManager do Android, cujo
 * diálogo permite imprimir ou "Guardar como PDF".
 *
 * Se o próprio HTML chamar window.print() (ex.: depois de gerar códigos QR), imprime nesse
 * momento; caso contrário imprime automaticamente pouco depois de a página terminar de carregar.
 */
@CapacitorPlugin(name = "NaturPrint")
public class NaturPrintPlugin extends Plugin {

    private static final long AUTO_PRINT_DELAY_MS = 1500;

    // Referência forte: a WebView tem de viver até o PrintManager terminar o layout.
    private WebView printWebView;
    private boolean printed;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html", "");
        String name = call.getString("name", "Documento");
        String baseUrl = call.getString("baseUrl", "https://www.natur-erva.co.mz/");
        if (html == null || html.isEmpty()) {
            call.reject("HTML vazio");
            return;
        }

        getActivity().runOnUiThread(() -> {
            printed = false;
            WebView wv = createWebView(name);
            printWebView = wv;
            // O window.print() do documento passa a chamar a impressão nativa
            String shim = "<script>window.print=function(){try{NaturPrintBridge.print()}catch(e){}};window.close=function(){};</script>";
            wv.loadDataWithBaseURL(baseUrl, shim + html, "text/html", "UTF-8", null);
            call.resolve();
        });
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private WebView createWebView(String name) {
        WebView wv = new WebView(getContext());
        wv.getSettings().setJavaScriptEnabled(true); // etiquetas geram QR codes via JS
        wv.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void print() {
                new Handler(Looper.getMainLooper()).post(() -> doPrint(wv, name));
            }
        }, "NaturPrintBridge");
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> doPrint(view, name), AUTO_PRINT_DELAY_MS);
            }
        });
        return wv;
    }

    private void doPrint(WebView view, String name) {
        if (printed || view != printWebView) return;
        printed = true;
        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
        if (pm == null) return;
        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
        pm.print(name, adapter, new PrintAttributes.Builder().build());
    }
}
