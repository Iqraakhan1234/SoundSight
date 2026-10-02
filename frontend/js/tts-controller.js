/**
 * SoundSight Text-to-Speech Controller
 *
 * Reliability design (why this file looks the way it does):
 *  - Every speak()/stop() bumps `sessionId`. Callbacks from an older
 *    utterance compare against it and bail out, so a late onend/onerror
 *    from a cancelled utterance can never corrupt the current speech.
 *  - A short gap is left between cancel() and the next speak(), because
 *    Chrome silently drops an utterance spoken immediately after cancel().
 *  - Two watchdogs: one if an utterance never starts, one if it starts and
 *    then stalls without ever firing onend (a known Chrome bug, especially
 *    with remote "Google" voices). Either way the controller recovers, so
 *    the app can never be left stuck on "Speaking" with the mic deaf.
 *  - Local (on-device) voices are preferred; they don't have the stall bug.
 */

class SoundSightTTS {
  constructor() {
    this.synth = window.speechSynthesis;
    this.currentRate = 1.0;
    this.currentPitch = 1.0;
    this.selectedVoice = null;
    this.lastSpokenText = '';
    this.lastExplanationText = '';
    this.isPaused = false;
    this.isSpeaking = false;
    this.chunks = [];
    this.currentChunkIndex = 0;
    this.currentOptions = {};

    this.sessionId = 0;
    this.startTimer = null;
    this.watchdogTimer = null;
    this.rearmWatchdog = null;
    this.failedChunks = 0;

    this.initVoices();
  }

  initVoices() {
    if (!this.synth) return;
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      if (!voices || voices.length === 0) return;

      const english = voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
      const localEnglish = english.filter(v => v.localService);
      const nicest = (list) => list.find(v => /natural|enhanced|premium/i.test(v.name)) || list[0];

      // Prefer on-device English voices: remote voices (e.g. "Google US
      // English") can stall mid-sentence and never report that they stopped.
      this.selectedVoice =
        (localEnglish.length && nicest(localEnglish)) ||
        (english.length && nicest(english)) ||
        voices[0];
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  setRate(rate) {
    this.currentRate = Math.max(0.5, Math.min(2.0, rate));
    return this.currentRate;
  }

  goSlow() {
    this.setRate(0.8);
    this.speak("Speech speed set to slow.");
  }

  goFaster() {
    this.setRate(1.3);
    this.speak("Speech speed set to faster.");
  }

  normalSpeed() {
    this.setRate(1.0);
    this.speak("Speech speed set to normal.");
  }

  /**
   * Chunks long explanations into clean sentence boundaries (<180 chars)
   * to bypass Chrome SpeechSynthesis buffer stall bug.
   */
  chunkText(text) {
    const clean = (text || '').trim();
    if (!clean) return [];

    const rawSentences = clean.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [clean];
    const chunks = [];

    for (let s of rawSentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;

      if (trimmed.length > 180) {
        // Sub-chunk on comma or semicolon
        const subParts = trimmed.match(/[^,;]+[,;]+|[^,;]+$/g) || [trimmed];
        for (let p of subParts) {
          const pTrim = p.trim();
          if (pTrim) chunks.push(pTrim);
        }
      } else {
        chunks.push(trimmed);
      }
    }

    return chunks.length > 0 ? chunks : [clean];
  }

  /**
   * Explain entrypoint with explicit logging per requirements.
   */
  speakExplanation(text, options = {}) {
    console.log('[TTS] Explain pressed');
    console.log(`[TTS] Explanation length: ${(text || '').length}`);
    this.lastExplanationText = text;
    this.speak(text, { ...options, isExplanation: true });
  }

  clearTimers() {
    if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null; }
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
  }

  /**
   * Cancels whatever is playing and invalidates its callbacks, WITHOUT
   * touching the voice-manager state (speak() is about to set it itself).
   */
  cancelCurrent() {
    this.sessionId++;
    this.clearTimers();
    this.rearmWatchdog = null;
    if (this.synth) {
      try {
        if (this.synth.paused) this.synth.resume();
        this.synth.cancel();
      } catch (e) { /* ignore */ }
    }
    window.__soundsight_active_utterance = null;
  }

  /**
   * Speaks text using a sentence-level queue to prevent GC drops.
   */
  speak(text, options = {}) {
    if (!this.synth) {
      console.warn('[TTS] SpeechSynthesis not supported.');
      if (options.onEnd) options.onEnd();
      return;
    }

    if (!text || !text.trim()) return;

    this.cancelCurrent();
    const id = this.sessionId;

    this.lastSpokenText = text;
    if (options.isExplanation) {
      this.lastExplanationText = text;
    }

    console.log('[TTS] Starting speech');
    this.chunks = this.chunkText(text);
    this.currentChunkIndex = 0;
    this.currentOptions = options;
    this.failedChunks = 0;
    this.isSpeaking = true;
    this.isPaused = false;

    // Chrome drops an utterance spoken right after cancel(); give it a beat.
    setTimeout(() => {
      if (id === this.sessionId) this.playNextChunk(id);
    }, 80);
  }

  playNextChunk(id) {
    if (id !== this.sessionId) return;

    if (this.currentChunkIndex >= this.chunks.length) {
      this.finish(id);
      return;
    }

    const chunk = this.chunks[this.currentChunkIndex];
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = this.currentOptions.rate || this.currentRate;
    utterance.pitch = this.currentOptions.pitch || this.currentPitch;
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || 'en-US';
    }

    // Retain global reference to avoid V8 garbage collection dropping utterance
    window.__soundsight_active_utterance = utterance;

    let started = false;
    let done = false;
    let abandoned = false;

    const advance = () => {
      if (done) return;
      done = true;
      this.clearTimers();
      if (id !== this.sessionId) return;
      this.currentChunkIndex++;
      this.playNextChunk(id);
    };

    // Give up on this chunk (stalled / never started) and move on.
    const abandon = () => {
      abandoned = true;
      this.clearTimers();
      try { this.synth.cancel(); } catch (e) { /* ignore */ }
      setTimeout(advance, 100);
    };

    const armWatchdog = () => {
      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
      const ms = Math.max(5000, (chunk.length * 110) / (utterance.rate || 1) + 3000);
      this.watchdogTimer = setTimeout(() => {
        if (abandoned || done || id !== this.sessionId) return;
        console.warn('[TTS] Speech stalled without finishing — skipping ahead');
        abandon();
      }, ms);
    };
    this.rearmWatchdog = armWatchdog;

    utterance.onstart = () => {
      started = true;
      this.failedChunks = 0;
      if (abandoned || id !== this.sessionId) return;
      if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null; }
      if (this.currentChunkIndex === 0) {
        console.log('[TTS] Speech started');
        this.updateUIStatus(true);
        if (window.SoundSightVoiceManager) {
          window.SoundSightVoiceManager.setState('SPEAKING');
        }
        if (this.currentOptions.onStart) {
          this.currentOptions.onStart();
        }
      }
      armWatchdog();
    };

    // Word-boundary events prove the voice is still alive; push the watchdog back.
    utterance.onboundary = () => {
      if (started && !abandoned && id === this.sessionId && !this.isPaused) armWatchdog();
    };

    utterance.onend = () => {
      if (abandoned) return;
      window.__soundsight_active_utterance = null;
      advance();
    };

    utterance.onerror = (e) => {
      if (abandoned) return;
      console.warn('[TTS] Speech error:', e && e.error);
      window.__soundsight_active_utterance = null;
      if (id === this.sessionId && this.currentOptions.onError) {
        const cb = this.currentOptions.onError;
        this.currentOptions.onError = null;
        cb(e);
      }
      advance(); // skip this chunk rather than freezing the whole app
    };

    // If the utterance never even starts, don't stay "speaking" forever.
    this.startTimer = setTimeout(() => {
      if (started || abandoned || done || id !== this.sessionId) return;
      console.warn('[TTS] Utterance never started');
      this.failedChunks++;
      if (this.failedChunks >= 2) {
        // Speech clearly isn't working right now — stop trying, free the mic.
        abandoned = true;
        try { this.synth.cancel(); } catch (e) { /* ignore */ }
        this.finish(id);
        return;
      }
      abandon();
    }, 4000);

    try {
      if (this.synth.paused && !this.isPaused) this.synth.resume();
      this.synth.speak(utterance);
    } catch (err) {
      console.warn('[TTS] speak() threw:', err);
      abandon();
    }
  }

  /** Natural end of speech (or gave up). Always hands the mic back. */
  finish(id) {
    if (id !== this.sessionId) return;
    this.clearTimers();
    this.rearmWatchdog = null;
    window.__soundsight_active_utterance = null;

    console.log('[TTS] Speech ended');
    this.isSpeaking = false;
    this.isPaused = false;
    this.updateUIStatus(false);

    const opts = this.currentOptions || {};
    this.currentOptions = {};

    if (window.SoundSightVoiceManager) {
      window.SoundSightVoiceManager.setState('LISTENING');
    }
    if (opts.onEnd) {
      opts.onEnd();
    }
  }

  stop() {
    this.cancelCurrent();
    this.isSpeaking = false;
    this.isPaused = false;
    this.chunks = [];
    this.currentChunkIndex = 0;
    this.currentOptions = {};
    this.updateUIStatus(false);
    if (window.SoundSightVoiceManager) {
      window.SoundSightVoiceManager.setState('LISTENING');
    }
  }

  pause() {
    if (this.synth && this.isSpeaking && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      // Don't let the stall-watchdog "skip" chunks while intentionally paused.
      this.clearTimers();
      this.updateUIStatus(false, 'paused');
      // Nothing is playing now, so the mic must be free to hear "Continue".
      if (window.SoundSightVoiceManager) {
        window.SoundSightVoiceManager.setState('LISTENING');
      }
    }
  }

  resume() {
    if (this.synth && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.updateUIStatus(true);
      if (window.SoundSightVoiceManager) {
        window.SoundSightVoiceManager.setState('SPEAKING');
      }
      if (this.rearmWatchdog) this.rearmWatchdog();
    }
  }

  repeat() {
    console.log('[TTS] Repeat triggered');
    if (this.lastExplanationText) {
      this.speakExplanation(this.lastExplanationText);
    } else if (this.lastSpokenText) {
      this.speak(this.lastSpokenText);
    } else {
      this.speak("Nothing to repeat.");
    }
  }

  updateUIStatus(isSpeaking, state = 'speaking') {
    const statusEl = document.getElementById('audioPlayingStatus');
    if (statusEl) {
      if (isSpeaking) {
        statusEl.textContent = '🔊 Speaking explanation';
        statusEl.classList.remove('hidden');
      } else if (state === 'paused') {
        statusEl.textContent = '⏸ Speech paused';
        statusEl.classList.remove('hidden');
      } else {
        statusEl.classList.add('hidden');
      }
    }
  }
}

window.SoundSightTTS = new SoundSightTTS();