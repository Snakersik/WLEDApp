import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export function WLEDLivePreviewWebView({
  ip,
  height = 180,
}: {
  ip: string;
  height?: number;
}) {
  const html = useMemo(() => {
    // Uwaga: używamy ws://IP/ws (WLED na porcie 80)
    return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">
<meta charset="utf-8">
<style>
  html, body { margin:0; padding:0; background:#1e293b; }
  #wrap { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  canvas { width:100%; height:100%; }
</style>
</head>
<body>
  <div id="wrap"><canvas id="canv"></canvas></div>
  <script>
    const ip = ${JSON.stringify(ip)};
    const wsUrl = "ws://" + ip + "/ws";
    const c = document.getElementById('canv');
    const ctx = c.getContext('2d');

    function setCanvas() {
      // real pixels
      c.width  = Math.floor(window.innerWidth);
      c.height = Math.floor(window.innerHeight);
      ctx.clearRect(0,0,c.width,c.height);
    }
    setCanvas();
    window.addEventListener('resize', () => setCanvas());

    let ws;
    function connect() {
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        // LiveView ON
        ws.send(JSON.stringify({lv:true}));
      };

      ws.onmessage = (e) => {
        try {
          if (!(e.data instanceof ArrayBuffer)) return;
          const leds = new Uint8Array(e.data);
          // expecting: 'L' (76), version 2
          if (leds[0] !== 76 || leds[1] !== 2) return;

          const mW = leds[2];
          const mH = leds[3];
          if (!mW || !mH) return;

          const pPL = Math.min(c.width / mW, c.height / mH);
          const lOf = Math.floor((c.width - pPL * mW) / 2);
          ctx.clearRect(0,0,c.width,c.height);

          let i = 4;
          for (let y=0.5; y<mH; y++) {
            for (let x=0.5; x<mW; x++) {
              const r = leds[i], g = leds[i+1], b = leds[i+2];
              ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
              ctx.beginPath();
              ctx.arc(x*pPL + lOf, y*pPL, pPL*0.38, 0, Math.PI*2);
              ctx.fill();
              i += 3;
            }
          }
        } catch (err) {
          // ignore
        }
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        setTimeout(connect, 800); // reconnect
      };
    }
    connect();
  </script>
</body>
</html>
    `;
  }, [ip]);

  return (
    <View style={[styles.card, { height }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        // ważne na Androidzie
        allowFileAccess
        mixedContentMode="always"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  web: {
    backgroundColor: "transparent",
  },
});
