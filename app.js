// Browser version of pc_audio.py. Web Serial receives PCM16; Web Audio plays it.
const PROFILES = {
  computer: { sampleRate: 16000, baudRate: 921600 },
  fast: { sampleRate: 48000, baudRate: 2000000 },
  "rp-pdm": { sampleRate: 8000, baudRate: 2000000 },
};
const RAW_HEADER = new Uint8Array([82, 65, 87, 13, 10]); // "RAW\r\n"
const START_COMMAND = new Uint8Array([82]);
const STOP_COMMAND = new Uint8Array([83]);
const AUDIO_FRAMES = 1024;
const START_DELAY_SECONDS = 0.12;
const MAX_QUEUE_SECONDS = 0.7;

const profileSelect = document.getElementById("profile");
const volumeInput = document.getElementById("volume");
const volumeValue = document.getElementById("volume-value");
const connectButton = document.getElementById("connect");
const disconnectButton = document.getElementById("disconnect");
const statusBox = document.getElementById("status-box");
const statusText = document.getElementById("status");
const meter = document.getElementById("meter");
const levelText = document.getElementById("level");
const receivedText = document.getElementById("received");
const queueText = document.getElementById("queue");

let activeSession = null;
let connecting = false;

function setStatus(message, state = "idle") {
  statusText.textContent = message;
  statusBox.dataset.state = state;
}

function updateControls() {
  connectButton.disabled = connecting || activeSession !== null;
  disconnectButton.disabled = activeSession === null;
  profileSelect.disabled = connecting || activeSession !== null;
}

function showStats(session) {
  if (activeSession !== session) return;
  meter.value = session.peak;
  levelText.value = `${Math.round(session.peak * 100)} %`;
  session.peak *= 0.7;
  receivedText.value = `${(session.receivedBytes / 1024).toFixed(1)} KB`;
  const queued = Math.max(0, session.nextPlayTime - session.audio.currentTime);
  queueText.value = `${Math.round(queued * 1000)} ms`;
}

function playChunk(session) {
  const audio = session.audio;
  const now = audio.currentTime;
  session.nextPlayTime = Math.max(session.nextPlayTime, now + START_DELAY_SECONDS);
  if (session.nextPlayTime - now > MAX_QUEUE_SECONDS) {
    session.droppedChunks += 1;
    return;
  }

  // AudioBufferSourceNode resamples this buffer to the speaker's sample rate.
  const buffer = audio.createBuffer(1, AUDIO_FRAMES, session.sampleRate);
  buffer.copyToChannel(session.frames, 0);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(session.gain);
  source.start(session.nextPlayTime);
  session.nextPlayTime += buffer.duration;
}

function addSample(session, unsigned) {
  const signed = unsigned < 0x8000 ? unsigned : unsigned - 0x10000;
  const value = signed / 32768;
  session.frames[session.frameCount++] = value;
  session.peak = Math.max(session.peak, Math.abs(value));
  if (session.frameCount === AUDIO_FRAMES) {
    playChunk(session);
    session.frameCount = 0;
  }
}

function receivePcm(session, bytes) {
  if (session.stopped || bytes.length === 0) return;
  session.receivedBytes += bytes.length;
  let index = 0;

  if (session.pendingByte !== -1) {
    addSample(session, session.pendingByte | (bytes[0] << 8));
    session.pendingByte = -1;
    index = 1;
  }
  for (; index + 1 < bytes.length; index += 2) {
    addSample(session, bytes[index] | (bytes[index + 1] << 8));
  }
  if (index < bytes.length) session.pendingByte = bytes[index];
}

async function readSerial(session) {
  while (!session.stopped) {
    const { value, done } = await session.reader.read();
    if (done) {
      if (!session.stopped) throw new Error("El puerto serial se cerró.");
      return;
    }
    if (!value || value.length === 0) continue;

    if (session.synced) {
      receivePcm(session, value);
      continue;
    }

    for (let i = 0; i < value.length; i += 1) {
      const byte = value[i];
      session.headerMatch = byte === RAW_HEADER[session.headerMatch]
        ? session.headerMatch + 1
        : (byte === RAW_HEADER[0] ? 1 : 0);
      if (session.headerMatch === RAW_HEADER.length) {
        session.synced = true;
        clearInterval(session.retryTimer);
        clearTimeout(session.syncTimer);
        setStatus("Recibiendo audio PCM16.", "ok");
        receivePcm(session, value.subarray(i + 1));
        break;
      }
    }
  }
}

async function closeSession(session) {
  if (session.closePromise) return session.closePromise;
  session.stopped = true;
  clearInterval(session.retryTimer);
  clearTimeout(session.syncTimer);
  clearInterval(session.statsTimer);
  disconnectButton.disabled = true;

  session.closePromise = (async () => {
    try { await session.writer.write(STOP_COMMAND); } catch (_) { /* Port may be gone. */ }
    try { await session.reader.cancel(); } catch (_) { /* Read may have ended. */ }
    try { session.reader.releaseLock(); } catch (_) { /* Already released. */ }
    try { session.writer.releaseLock(); } catch (_) { /* Already released. */ }
    try { await session.port.close(); } catch (_) { /* Port may be gone. */ }
    try { await session.audio.close(); } catch (_) { /* Context may be closed. */ }

    if (activeSession === session) {
      activeSession = null;
      meter.value = 0;
      levelText.value = "0 %";
      queueText.value = "0 ms";
      setStatus(session.finalMessage || "Desconectado.", session.finalMessage ? "error" : "idle");
      updateControls();
    }
  })();
  return session.closePromise;
}

async function connect() {
  if (connecting || activeSession) return;
  if (!window.isSecureContext || !("serial" in navigator)) {
    setStatus("Web Serial requiere Chrome o Edge de escritorio en localhost o HTTPS.", "error");
    return;
  }

  connecting = true;
  updateControls();
  setStatus("Selecciona el puerto serial del dispositivo…", "busy");
  const profile = PROFILES[profileSelect.value];
  let audio = null;
  let port = null;
  let reader = null;
  let writer = null;

  try {
    // requestPort must run directly from the button's click handler.
    const portPromise = navigator.serial.requestPort();
    audio = new AudioContext();
    [port] = await Promise.all([portPromise, audio.resume()]);
    await port.open({ baudRate: profile.baudRate });
    reader = port.readable.getReader();
    writer = port.writable.getWriter();

    const gain = audio.createGain();
    gain.gain.value = Number(volumeInput.value) / 100;
    gain.connect(audio.destination);
    const session = {
      audio, port, reader, writer, gain,
      sampleRate: profile.sampleRate,
      frames: new Float32Array(AUDIO_FRAMES),
      frameCount: 0,
      pendingByte: -1,
      headerMatch: 0,
      synced: false,
      stopped: false,
      receivedBytes: 0,
      droppedChunks: 0,
      peak: 0,
      nextPlayTime: 0,
      closePromise: null,
      finalMessage: "",
      retryTimer: null,
      syncTimer: null,
      statsTimer: null,
    };
    activeSession = session;
    connecting = false;
    updateControls();
    setStatus("Esperando encabezado RAW del dispositivo…", "busy");

    session.retryTimer = setInterval(() => {
      if (!session.synced && !session.stopped) {
        writer.write(START_COMMAND).catch(() => {
          session.finalMessage = "Se perdió la conexión serial.";
          void closeSession(session);
        });
      }
    }, 500);
    session.syncTimer = setTimeout(() => {
      if (!session.synced && !session.stopped) {
        session.finalMessage = "No llegó RAW. Revisa el sketch, el perfil y el puerto.";
        void closeSession(session);
      }
    }, 6000);
    session.statsTimer = setInterval(() => showStats(session), 100);
    await writer.write(START_COMMAND);
    void readSerial(session).catch((error) => {
      if (!session.stopped) session.finalMessage = error.message || String(error);
    }).finally(() => closeSession(session));
  } catch (error) {
    if (activeSession) {
      activeSession.finalMessage = error.message || String(error);
      await closeSession(activeSession);
    } else {
      try { reader?.releaseLock(); } catch (_) { /* No active read. */ }
      try { writer?.releaseLock(); } catch (_) { /* No active write. */ }
      try { await port?.close(); } catch (_) { /* Port may not be open. */ }
      try { await audio?.close(); } catch (_) { /* Context may not be open. */ }
      setStatus(error.name === "NotFoundError" ? "Selección de puerto cancelada." :
        `No se pudo conectar: ${error.message || error}`, "error");
    }
    connecting = false;
    updateControls();
  }
}

connectButton.addEventListener("click", connect);
disconnectButton.addEventListener("click", () => {
  if (activeSession) void closeSession(activeSession);
});
volumeInput.addEventListener("input", () => {
  const volume = Number(volumeInput.value) / 100;
  volumeValue.value = `${volumeInput.value} %`;
  if (activeSession) {
    activeSession.gain.gain.setTargetAtTime(volume, activeSession.audio.currentTime, 0.02);
  }
});
updateControls();
if (!window.isSecureContext || !("serial" in navigator)) {
  setStatus("Abre esta página en Chrome o Edge de escritorio mediante localhost o HTTPS.", "error");
  connectButton.disabled = true;
}
