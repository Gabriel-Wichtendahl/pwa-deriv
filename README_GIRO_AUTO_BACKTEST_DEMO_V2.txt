# Deriv Signals — GIRO AUTO BACKTEST DEMO V2

Versión paralela automática para backtesting/demo.

## Cambios de esta versión

- No genera señales tempranas a 35s, 40s ni 45s.
- La señal aparece recién cuando la vela cierra en 60s.
- La operación automática se intenta en DEMO justo después de crear la señal al cierre.
- No usa zona amarilla ni condición de “cerca del SNR”.
- Solo acepta cierre 60s dentro de la zona SNR.
- Se eliminó la condición de segundo rechazo/doble rechazo para esta rama automática.
- El SNR solo es válido si la misma zona actuó como mínimo con una secuencia:
  - SOPORTE → RESISTENCIA → SOPORTE, o
  - RESISTENCIA → SOPORTE → RESISTENCIA.
- Dirección de trade por giro:
  - Vela/formación alcista al cierre → VENTA / PUT.
  - Vela/formación bajista al cierre → COMPRA / CALL.
- Bloquea si antes de la señal hay momentum de más de 3 velas consecutivas en la misma dirección.
- Cuenta forzada a DEMO.
- Historial, journal, links y capturas usan claves separadas `giroAutoBacktest_v1` para no contaminar la PWA principal.

## Archivos

- index.html
- style.css
- app.js
- manifest.json
- sw.js

Si tu carpeta original tiene `icon-192.png`, `icon-512.png`, `alert.mp3` y `bg-neon.png`, dejalos junto a estos archivos.
