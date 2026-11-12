package com.mobiloyun.melodim;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
