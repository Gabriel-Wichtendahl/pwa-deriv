# Deriv Signals — GIRO AUTO BACKTEST DEMO V3

Versión paralela automática para backtesting/demo.

## Cambio clave de V3

La señal ya no aparece antes para después validar el trade.
Ahora la señal se crea únicamente cuando el cierre real de la vela, confirmado con `ticks_history`, cumple todas las reglas.

## Reglas activas

1. Solo cuenta DEMO.
2. No hay señal temprana a 35s, 40s ni 45s.
3. La vela se analiza recién al cierre 60s real.
4. El cierre 60s debe quedar dentro de la zona SNR.
5. No se usa zona amarilla ni tolerancia de cercanía.
6. El SNR debe tener secuencia mínima alternada:
   - soporte → resistencia → soporte, o
   - resistencia → soporte → resistencia.
7. No se usa segundo rechazo / doble rechazo para esta rama automática.
8. Si el filtro de momentum de más de 3 velas consecutivas se activa, no se muestra señal.
9. Formación alcista al cierre → trade PUT / VENTA.
10. Formación bajista al cierre → trade CALL / COMPRA.

## Storage separado

Esta versión usa claves separadas V3:

- `derivSignalsHistory_giroAutoBacktest_v3`
- `derivTradesJournal_giroAutoBacktest_v3`
- `derivTradeLinks_giroAutoBacktest_v3`

Así no se mezclan señales viejas de V1/V2 ni de la PWA principal.

## Nota

Si no se puede confirmar el cierre real del minuto con `ticks_history`, no se crea señal.
