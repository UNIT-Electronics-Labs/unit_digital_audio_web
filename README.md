# UNIT Digital Audio Web

Reproductor web para audio PCM16 mono enviado por USB/Serial desde los ejemplos
I2S o PDM de [DevLab_AudioInput](https://github.com/UNIT-Electronics-MX/unit_devlab_audioinput_library).
El navegador abre el puerto con Web Serial y reproduce el audio con Web Audio.
No requiere paquetes JavaScript ni un servidor de aplicación.

## Uso local

1. Carga `I2S/ComputerAudio` o `PDM/ComputerAudio` de la versión
   [v0.3.3](https://github.com/UNIT-Electronics-MX/unit_devlab_audioinput_library/tree/v0.3.3)
   de la biblioteca. Cierra el Monitor Serie.
2. En este directorio ejecuta:

   ```bash
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

3. Abre `http://127.0.0.1:8000/` en Chrome o Edge de escritorio.
4. Selecciona **ComputerAudio · 16 kHz · 921600 baud**, pulsa **Conectar y
   escuchar** y elige el puerto de la placa.

La página también ofrece perfiles para `SerialStream` a 48 kHz/2000000 baud y
PDM en RP2040/RP2350 a 8 kHz/2000000 baud. El perfil debe coincidir con la
frecuencia y velocidad del sketch. El audio en RP2040/RP2350 aún no se ha
validado en placas físicas.

## Protocolo

- La página envía `R` para iniciar o sincronizar y `S` al desconectar.
- El dispositivo responde con `RAW\r\n` antes de los datos.
- Los datos son muestras PCM16 mono con signo, little endian, sin delimitadores.
- La salida se reproduce en el dispositivo de audio predeterminado del sistema.
  Esta página no crea un micrófono virtual para otras aplicaciones.

Web Serial requiere un navegador compatible y un contexto seguro, como
`localhost` o HTTPS. Cierra cualquier programa que esté usando el puerto
serial antes de conectar.

## Publicación en GitHub Pages

El proyecto es estático: `index.html` y `app.js` se sirven desde la raíz.
En **Settings > Pages**, selecciona **Deploy from a branch**, la rama `main`
y la carpeta **/(root)**. La URL resultante será
`https://unit-electronics-labs.github.io/unit_digital_audio_web/`.
