GIRO AUTO BACKTEST DEMO V5 — SNR ROLE FLIP

Versión paralela automática para demo/backtesting.

Regla activa de prueba:
- La señal nace solo al cierre real del minuto, con ticks_history confirmado.
- No hay señal temprana 35/40/45.
- No se exige doble rechazo.
- No se exige S-R-S/R-S-R.
- Se usa cambio de rol simple del SNR:
  * Soporte que pasa a resistencia: S-R
  * Resistencia que pasa a soporte: R-S
- El cierre 60s debe quedar dentro de la zona SNR.
- No usa zona amarilla.
- Demo only.
- Dirección invertida por formación:
  * vela/formación alcista => PUT
  * vela/formación bajista => CALL
- Mantiene diagnóstico visible para ver por qué no sale señal.
- Mantiene bloqueo de momentum > 3 velas consecutivas, igual que la regla original de esta rama.

Después de subir los archivos a GitHub Pages, tocar Reset Cache/SW en la app.
