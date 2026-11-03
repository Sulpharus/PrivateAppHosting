// The audio driver the editor calls (Module.driver: open, resume, suspend, close, outputSpec).
// MuseScore's audio engine (MuseAudio) runs inside an AudioWorklet. Upstream glues its files into a
// blob: script at run time; the gate's CSP allows no blob: scripts, so build.mjs writes the same
// glue as one file (`worklet`, e.g. muse-audio-worklet.js) that is loaded from the app itself.

/** @param {{ worklet: string }} options */
export function createAudioDriver(options) {
  let context = null;
  let processor = null;

  const driver = {
    inited: false,

    /** Starts the worklet and hands it the message port to the editor. */
    async setup(Module) {
      context = new AudioContext({ latencyHint: 'interactive' });
      await context.audioWorklet.addModule(new URL(options.worklet, import.meta.url));
      processor = new AudioWorkletNode(context, 'musedriver-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      // An exception in the engine stops the processor for good; without this it fails silently.
      processor.onprocessorerror = (event) =>
        console.error('[musescore audio] engine stopped', event);
      processor.port.onmessage = (event) => {
        if (event.data?.type === 'DRIVER_INITED') {
          driver.inited = true;
          if (Module.isNeedStartAudio) Module._startAudioProcessing();
          if (Module.soundFont) Module.ccall('addSoundFont', '', ['string'], [Module.soundFont]);
          Module.mnFlushSoundFonts?.();
        } else if (event.data?.type === 'debug') {
          console.debug('[musescore audio]', event.data.msg);
        } else if (typeof event.data === 'string') {
          // The engine reports start-up errors as plain strings ("MuseAudio_entry ERROR: …").
          console.warn('[musescore audio]', event.data);
        }
      };
      const port = Module.main_worker_rpcChannel.port2;
      processor.port.postMessage(
        { type: 'INITIALIZE_DRIVER', config: Module.config, rpcPort: port, options: {} },
        [port],
      );
    },

    outputSpec() {
      return {
        sampleRate: context.sampleRate,
        samplesPerChannel: Math.max(Math.round(context.baseLatency * context.sampleRate), 128),
        audioChannelCount: context.destination.channelCount,
      };
    },

    open() {
      processor.connect(context.destination);
      context.resume();
    },

    resume() {
      context.resume();
    },

    suspend() {
      context.suspend();
    },

    close() {
      processor.disconnect();
    },
  };
  return driver;
}
