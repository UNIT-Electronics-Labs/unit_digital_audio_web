# UNIT Digital Audio Web

A browser player for mono PCM16 audio sent over USB serial by the I2S and PDM
examples in [DevLab_AudioInput](https://github.com/UNIT-Electronics-MX/unit_devlab_audioinput_library).
The browser opens the port with Web Serial and plays audio with Web Audio. No
JavaScript packages or application server are required.

## Run locally

1. Upload `I2S/ComputerAudio` or `PDM/ComputerAudio` from library version
   [v0.3.3](https://github.com/UNIT-Electronics-MX/unit_devlab_audioinput_library/tree/v0.3.3).
   Close the Arduino Serial Monitor.
2. Run this command from the website directory:

   ```bash
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

3. Open `http://127.0.0.1:8000/` in desktop Chrome or Edge.
4. Keep **ComputerAudio · 16 kHz · 921600 baud** selected, click **Connect and
   listen**, and choose the board's serial port.

The page also has profiles for `SerialStream` at 48 kHz/2000000 baud and PDM
on RP2040/RP2350 at 8 kHz/2000000 baud. The selected profile must match the
sketch's sample rate and baud rate. Audio on RP2040/RP2350 has not been verified
on physical boards.

## Serial protocol

- The page sends `R` to start or resynchronize and `S` when disconnecting.
- The board sends `RAW\r\n` before the audio data.
- Audio data is signed, little-endian, mono PCM16 with no delimiters.
- Playback uses the system's default audio output. This page does not create
  a virtual microphone for other applications.

Web Serial requires a compatible browser and a secure context such as
`localhost` or HTTPS. Close any other application using the serial port before
connecting.

## Publish with GitHub Pages

This is a static site: `index.html` and `app.js` are served from the repository
root. In **Settings > Pages**, choose **Deploy from a branch**, select `main`
and **/(root)**, then save. The site URL will be
`https://unit-electronics-labs.github.io/unit_digital_audio_web/`.
