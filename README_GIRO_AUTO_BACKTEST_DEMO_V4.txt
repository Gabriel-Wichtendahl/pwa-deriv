# Giro Auto Backtest Demo V4 — Diagnóstico visible

Esta versión mantiene la regla estricta de la V3, pero agrega diagnóstico visible para entender por qué no aparecen señales.

Regla de entrada sigue igual:
- Solo DEMO.
- Señal recién al cierre real de 60s confirmado por ticks_history.
- No usa señal temprana 35/40/45.
- No usa zona amarilla.
- No usa doble rechazo / segundo rechazo.
- Solo crea señal si el cierre 60s queda dentro de una zona SNR con secuencia mínima S-R-S o R-S-R.

Nuevo en V4:
- Panel “Auto 60 · diagnóstico” visible en la pantalla.
- Muestra por símbolo si el cierre fue descartado por:
  - esperando ticks_history,
  - sin memoria suficiente de velas,
  - sin zona SNR con mínimo de toques,
  - SNR sin secuencia S-R-S/R-S-R,
  - cierre fuera del SNR alternado,
  - momentum mayor a 3 velas,
  - empate de calidad entre símbolos.
- Usa storage separado v4 para no mezclar señales/trades con versiones anteriores.

IMPORTANTE: después de subir a GitHub Pages, tocar “Reset Cache/SW” dentro de la app o borrar caché del navegador/PWA.
