PWA DERIV — GIRO AUTO BACKTEST DEMO V1

Versión paralela basada en los archivos subidos.

Cambios principales:
1. Historial, trades, links y otros estados usan claves separadas con sufijo giroAutoBacktest_v1.
2. La cuenta queda forzada a DEMO. El botón de cuenta no cambia a REAL en esta rama.
3. La autoentrada de Señales se evalúa al cierre real de la vela: segundo 60.
4. No usa zona amarilla ni tolerancia de “cerca”. Solo acepta cierre dentro de la zona SNR.
5. Solo opera señales de familia GIRO/SNR.
6. Dirección automática invertida por formación:
   - Formación alcista al cierre => VENTA / PUT.
   - Formación bajista al cierre => COMPRA / CALL.
7. Bloquea la autoentrada si detecta momentum de más de 3 velas consecutivas en la misma dirección antes de la señal.
8. Cada intento automático queda marcado como AUTO_BACKTEST_DEMO_60 con version GIRO_AUTO_BACKTEST_DEMO_V1.
9. Service Worker con cache propio: deriv-assets-giro-auto-backtest-demo-v1.

Archivos incluidos:
- index.html
- style.css
- app.js
- manifest.json
- sw.js

Nota:
Si desplegás esta versión en la misma carpeta que la PWA anterior, conviene usar Reset Cache/SW después de subirla.
Lo ideal es ponerla en una carpeta/ruta separada para que sea realmente paralela.
