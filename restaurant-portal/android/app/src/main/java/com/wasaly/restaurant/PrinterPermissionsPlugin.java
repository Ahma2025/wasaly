package com.wasaly.restaurant;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * أذونات ماكنة الطلبات:
 *  - بلوتوث: Android 12+ يحتاج إذن «الأجهزة القريبة» (BLUETOOTH_CONNECT/SCAN) وقت التشغيل،
 *    وإضافة الطباعة (thermal-printer-cordova-plugin) لا تطلبه.
 *  - USB: طلب إذن الجهاز بـ PendingIntent متوافق مع Android 12+ (إضافة الطباعة تستخدم flag 0 فتنهار).
 */
@CapacitorPlugin(
    name = "PrinterPermissions",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN })
    }
)
public class PrinterPermissionsPlugin extends Plugin {

    private boolean hasBluetoothConnect() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void checkBluetooth(PluginCall call) {
        resolveGranted(call, hasBluetoothConnect());
    }

    @PluginMethod
    public void requestBluetooth(PluginCall call) {
        if (hasBluetoothConnect()) {
            resolveGranted(call, true);
            return;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback");
    }

    @PermissionCallback
    private void bluetoothPermsCallback(PluginCall call) {
        resolveGranted(call, hasBluetoothConnect());
    }

    @PluginMethod
    public void requestUsb(PluginCall call) {
        Integer deviceId = call.getInt("deviceId");
        UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (usbManager == null || deviceId == null) {
            resolveGranted(call, false);
            return;
        }
        UsbDevice device = null;
        for (UsbDevice d : usbManager.getDeviceList().values()) {
            if (d.getDeviceId() == deviceId) { device = d; break; }
        }
        if (device == null) {
            call.reject("Device not found or not connected!");
            return;
        }
        if (usbManager.hasPermission(device)) {
            resolveGranted(call, true);
            return;
        }

        final String action = getContext().getPackageName() + ".USB_PERMISSION";
        final Context ctx = getContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!action.equals(intent.getAction())) return;
                try { ctx.unregisterReceiver(this); } catch (Exception ignored) {}
                resolveGranted(call, intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false));
            }
        };
        IntentFilter filter = new IntentFilter(action);
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, filter);
        }

        Intent intent = new Intent(action);
        intent.setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, intent, flags);
        usbManager.requestPermission(device, pi);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
