package com.mobiloyun.melodim;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Web tarafındaki çalara arka plan desteği verir:
 * çalarken bir ön plan servisi (bildirim + kilit ekranı kontrolleri) açık tutar,
 * böylece Android uygulamayı arka planda kapatmaz.
 */
@CapacitorPlugin(name = "MediaService")
public class MediaServicePlugin extends Plugin {

    private static MediaServicePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent i = new Intent(getContext(), PlaybackService.class);
        i.setAction(PlaybackService.ACTION_UPDATE);
        i.putExtra("title", call.getString("title", "Melodim"));
        i.putExtra("artist", call.getString("artist", ""));
        i.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)));
        i.putExtra("live", Boolean.TRUE.equals(call.getBoolean("live", false)));
        try {
            if (PlaybackService.running) {
                getContext().startService(i);
            } else {
                ContextCompat.startForegroundService(getContext(), i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Servis başlatılamadı: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    /** Bildirim / kilit ekranı / kulaklık düğmelerinden gelen komutları JS'e iletir. */
    static void emit(String action) {
        MediaServicePlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("action", action);
        p.notifyListeners("action", o, true);
    }
}
