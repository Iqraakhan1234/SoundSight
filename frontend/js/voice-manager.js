/**
 * SoundSight Voice Command System & State Manager
 * Features:
 * - SpeechRecognition with auto-restart resilience
 * - Anti-echo TTS lockout (ignores input during SPEAKING state)
 * - 5 explicit states: IDLE, LISTENING, COMMAND_DETECTED, PROCESSING, SPEAKING
 * - Natural language intent routing and alias mapping
 * - Visual & acoustic feedback
 */

class SoundSightVoiceManager {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.shouldListen = false;
    this.state = 'IDLE'; // IDLE | LISTENING | COMMAND_DETECTED | PROCESSING | SPEAKING
    this.commandHandlers = {};
    this.lastTranscript = '';
    this.silenceTimer = null;
    this.stateCallbacks = [];
    this.micTested = false;
    this.lastCommandText = '';
    this.lastCommandTime = 0;
    this.isProcessingCommand = false;
    this.healthTimer = null;
    // Short navigation commands that are allowed to interrupt speech.
    this.bargeInIntents = new Set([
      'SCAN', 'UPLOAD', 'HISTORY', 'REVISE', 'REVISE_MODE', 'OPEN_ITEM',
      'HELP', 'SETTINGS', 'HOME', 'BACK', 'EXPLAIN', 'EXPLAIN_AGAIN',
      'REPEAT', 'GO_SLOW', 'GO_FASTER', 'NORMAL_SPEED', 'PAUSE', 'STOP'
    ]);

    this.initRecognition();
  }

  initRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      console.log("[VOICE] SpeechRecognition supported");
    } else {
      console.error("[VOICE] SpeechRecognition not supported");
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    // Ask the browser for a few guesses per phrase, not just its top pick.
    // Accented or noisy speech often lands on the 2nd/3rd alternative.
    this.recognition.maxAlternatives = 4;

    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('[VOICE] Recognition started');
      if (!this.isTtsActive()) {
        this.setState('LISTENING');
      }
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      // Collect every alternative transcript the engine offered for the
      // final result, so a misheard top guess doesn't block a command
      // that shows up correctly in guess #2 or #3.
      let finalAlternatives = [];

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          for (let a = 0; a < result.length; a++) {
            if (result[a] && result[a].transcript) {
              finalAlternatives.push(result[a].transcript);
            }
          }
        } else {
          interim += result[0].transcript;
        }
      }

      const text = (final || interim).trim();
      if (!text) return;

      this.lastTranscript = text;
      this.updateTranscriptUI(text, !!final);

      // CRITICAL ANTI-ECHO GUARD:
      // While TTS is speaking, drop microphone audio to avoid self-triggering commands!
      // Interim results are still checked here (not just final) so the user
      // can barge in and say "stop" without waiting for a pause.
      if (this.isTtsActive()) {
        const lower = text.toLowerCase();
        if (/\b(stop|halt|pause|silence|be quiet|shut up)\b/i.test(lower)) {
          console.log('[VOICE] TTS Barge-in stop detected.');
          if (window.SoundSightTTS) {
            window.SoundSightTTS.stop();
          }
          if (window.SoundSightEarcons) {
            window.SoundSightEarcons.commandChime();
          }
          this.setState('LISTENING');
        } else if (final) {
          // A short command like "history" / "upload" / "revise" should work
          // even while SoundSight is talking (no need to say "stop" first).
          this.tryBargeInCommand(final.trim(), finalAlternatives);
        }
        return;
      }

      // IMPORTANT: only act on FINAL results for ordinary commands.
      // Acting on interim (still-changing) text was causing the same
      // spoken command to fire two or three times in a row as the
      // recognizer revised its guess — that's what made "Scan" open
      // the camera repeatedly / unreliably. Interim text is still shown
      // live in the UI above, just not executed.
      if (final) {
        this.processCommand(final.trim(), finalAlternatives);
      }
    };

    this.recognition.onerror = (event) => {
      console.log(`[VOICE] Error: ${event.error}`);
      if (event.error === 'not-allowed') {
        this.shouldListen = false;
        this.setState('IDLE');
        if (window.SoundSightTTS) {
          window.SoundSightTTS.speak("Microphone access is unavailable. Please allow microphone permission in your browser settings.");
        }
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      console.log('[VOICE] Recognition ended');
      // Auto-restart if we are supposed to remain listening and not actively speaking
      if (this.shouldListen && !this.isTtsActive()) {
        setTimeout(() => {
          try {
            if (this.shouldListen && !this.isListening && !this.isTtsActive()) {
              this.recognition.start();
            }
          } catch (e) {
            // Already active or restarting
          }
        }, 300);
      } else {
        if (!this.isTtsActive()) {
          this.setState('IDLE');
        }
      }
    };
  }

  async checkMicrophoneAccess() {
    if (this.micTested) return true;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[VOICE] Microphone access granted');
        // Stop the probe stream so browser audio input remains dedicated to SpeechRecognition
        stream.getTracks().forEach(track => track.stop());
        this.micTested = true;
        return true;
      } catch (e) {
        console.warn('[VOICE] Microphone query note:', e);
      }
    }
    return true;
  }

  /** True only while speech is genuinely playing (speaking and not paused). */
  isTtsActive() {
    const tts = window.SoundSightTTS;
    return !!(tts && tts.isSpeaking && !tts.isPaused);
  }

  /**
   * Self-healing: a blind user can't tap the mic button to recover, so the
   * app must recover on its own. Every 1.5s, while listening is wanted:
   *  - if the badge says "Speaking" but nothing is actually playing, fix it
   *  - if recognition has died (Chrome ends it after silence/errors), restart it
   */
  startHealthCheck() {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => this.healthCheck(), 1500);
  }

  stopHealthCheck() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  healthCheck() {
    if (!this.shouldListen) return;
    const ttsActive = this.isTtsActive();

    if (this.state === 'SPEAKING' && !ttsActive) {
      console.warn('[VOICE] Badge said SPEAKING but nothing is playing - recovering to LISTENING');
      const tts = window.SoundSightTTS;
      if (tts && !tts.isPaused) tts.updateUIStatus(false);
      this.setState('LISTENING');
    }

    if (!ttsActive && !this.isListening && this.recognition) {
      try {
        this.recognition.start();
      } catch (e) {
        // Already starting - fine
      }
    }
  }

  async startListening() {
    this.shouldListen = true;
    this.startHealthCheck();
    await this.checkMicrophoneAccess();

    if (this.recognition && !this.isListening && !this.isTtsActive()) {
      try {
        this.recognition.start();
        if (window.SoundSightEarcons) {
          window.SoundSightEarcons.listeningBeep();
        }
      } catch (e) {
        // Recognition already active
      }
    }
  }

  stopListening() {
    this.shouldListen = false;
    this.stopHealthCheck();
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Recognition already stopped
      }
    }
    this.setState('IDLE');
  }

  toggleListening() {
    if (this.shouldListen) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  setState(newState) {
    const prevState = this.state;
    this.state = newState;
    console.log('[VoiceManager] State changed to:', newState);
    this.updateStateUI();
    this.stateCallbacks.forEach(cb => cb(newState));

    // When returning to LISTENING from SPEAKING, ensure recognition resumes
    if (prevState === 'SPEAKING' && newState === 'LISTENING' && this.shouldListen && !this.isListening) {
      setTimeout(() => {
        try {
          if (this.shouldListen && !this.isListening && this.state === 'LISTENING') {
            this.recognition?.start();
          }
        } catch (e) {
          // Handled
        }
      }, 250);
    }
  }

  onStateChange(cb) {
    this.stateCallbacks.push(cb);
  }

  registerCommand(intent, callback) {
    this.commandHandlers[intent] = callback;
  }

  /**
   * Ordered, substring-based command list. Checked top to bottom, first
   * match wins. Substring matching (not strict \bword\b regex) on purpose:
   * speech recognition regularly returns "scanning"/"scanner"/"scammed"-ish
   * variants for short words, and a strict word-boundary match silently
   * drops all of those. Add more phrases to any `words` array any time a
   * new mishearing shows up in the console logs.
   */
  getIntentRules() {
    return [
      { intent: 'REVISE_MODE', payload: 'quick', words: ['quick revision', 'quick review'] },
      { intent: 'REVISE_MODE', payload: 'detailed', words: ['detailed revision', 'detailed review'] },
      { intent: 'REVISE_MODE', payload: 'exam', words: ['exam revision', 'exam review'] },
      { intent: 'REVISE_MODE', payload: 'question', words: ['question mode'] },
      { intent: 'STOP', words: ['stop', 'halt', 'be quiet', 'silence', 'shut up'] },
      { intent: 'PAUSE', words: ['pause', 'hold on'] },
      { intent: 'CONTINUE', words: ['continue', 'resume', 'keep going'] },
      { intent: 'REPEAT', words: ['repeat', 'say again', 'read again', 'play again'] },
      { intent: 'GO_SLOW', words: ['go slow', 'slower', 'slow down', 'slow'] },
      { intent: 'GO_FASTER', words: ['go faster', 'faster', 'speed up'] },
      { intent: 'NORMAL_SPEED', words: ['normal speed', 'normal'] },
      { intent: 'START', words: ['start soundsight', 'start app', 'begin', 'start'] },
      { intent: 'OPEN_ITEM', words: ['open item', 'item one', 'item two', 'item three', 'item four', 'item five', 'item 1', 'item 2', 'item 3', 'item 4', 'item 5'] },
      { intent: 'SCAN', words: ['scan', 'open camera', 'camera', 'take a photo', 'take photo'] },
      { intent: 'UPLOAD', words: ['upload', 'uploaded', 'up load', 'choose file', 'choose a file'] },
      { intent: 'HISTORY', words: ['history', 'saved items'] },
      { intent: 'EXPLAIN_AGAIN', words: ['explain again', 'restart explanation'] },
      { intent: 'EXPLAIN', words: ['explain', 'read it', 'read out', 'what does it say', 'read explanation'] },
      { intent: 'HELP', words: ['help', 'what can i say', 'instructions', 'assist'] },
      { intent: 'SETTINGS', words: ['settings', 'setting', 'options', 'preferences', 'setup', 'configuration'] },
      { intent: 'HOME', words: ['home', 'dashboard', 'go home'] },
      { intent: 'BACK', words: ['back'] },
      { intent: 'REVISE', words: ['revise', 'revised', 'revising', 'revive', 'revision', 'review', 'quiz', 'practice', 'test me'] }
    ];
  }

  /**
   * A hard, exact-match fallback for the 6 dashboard cards, keyed to the
   * same numbers already printed on each card ("Key 1" ... "Key 6"). Short
   * digit/number words are far more reliably recognized across accents
   * than multi-syllable words like "Settings" or "Revision" — if a word
   * command keeps getting missed, saying its number is the reliable
   * backup. Deliberately an EXACT match (not substring) so a stray "one"
   * inside an unrelated sentence can't misfire a card open.
   */
  getNumberFallbackMap() {
    return {
      'one': 'SCAN', '1': 'SCAN',
      'two': 'UPLOAD', '2': 'UPLOAD',
      'three': 'HISTORY', '3': 'HISTORY',
      'four': 'REVISE', '4': 'REVISE',
      'five': 'HELP', '5': 'HELP',
      'six': 'SETTINGS', '6': 'SETTINGS'
    };
  }

  /**
   * Matches an intent against the primary transcript AND every alternative
   * transcript the recognizer offered, so a misheard top guess doesn't
   * block a command that the engine got right further down its list.
   */
  levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /**
   * Finds the first rule whose phrase appears in `candidate`.
   * forgiving=true additionally tolerates the recognizer splitting a word
   * ("up load") or being one letter off ("revive" for "revise").
   */
  findRule(candidate, forgiving) {
    const rules = this.getIntentRules();
    const compact = candidate.replace(/\s+/g, '');
    const tokens = candidate.split(/\s+/).filter(Boolean);

    for (const rule of rules) {
      for (const w of rule.words) {
        if (candidate.includes(w)) return rule;
        if (!forgiving) continue;

        const wCompact = w.replace(/\s+/g, '');
        if (wCompact.length >= 6 && compact.includes(wCompact)) return rule;

        if (!w.includes(' ') && w.length >= 5) {
          if (tokens.some(t => Math.abs(t.length - w.length) <= 1 && this.levenshtein(t, w) <= 1)) {
            return rule;
          }
        }
      }
    }
    return null;
  }

  /**
   * Matches an intent. The recognizer's top guess gets full priority; the
   * alternative guesses are only consulted if the top guess matched nothing,
   * so a low-ranked alternative can never override what was actually heard.
   */
  matchIntent(normPrimary, normAlternatives) {
    const candidates = [normPrimary, ...normAlternatives];

    const build = (rule) => {
      let payload = rule.payload !== undefined ? rule.payload : normPrimary;
      if (rule.intent === 'REVISE') {
        payload = normPrimary.replace(/^(revise|revision|review|practice|quiz)\s*(for|about|on)?\s*/i, '').trim();
      }
      return { intent: rule.intent, payload };
    };

    // Pass 1: exact phrase match, top guess first
    for (const c of candidates) {
      const rule = this.findRule(c, false);
      if (rule) return build(rule);
    }

    // Pass 2: forgiving match, only for short utterances (real commands are short)
    for (const c of candidates) {
      if (c.split(/\s+/).filter(Boolean).length > 3) continue;
      const rule = this.findRule(c, true);
      if (rule) return build(rule);
    }

    // Exact-number fallback (unadvertised)
    const numberMap = this.getNumberFallbackMap();
    for (const c of candidates) {
      const trimmed = c.trim();
      if (numberMap[trimmed]) {
        return { intent: numberMap[trimmed], payload: normPrimary };
      }
    }

    return { intent: 'FREEFORM', payload: normPrimary };
  }

  /**
   * While SoundSight is talking, a short navigation command should still
   * work - a blind user shouldn't have to say "stop" and then repeat it.
   * Only short (<= 3 word) final phrases qualify, which keeps speaker audio
   * picked up by the mic (long sentences) from triggering anything.
   */
  tryBargeInCommand(finalText, alternatives) {
    const norm = finalText.toLowerCase().trim();
    if (norm.split(/\s+/).filter(Boolean).length > 3) return false;
    const alts = (alternatives || []).map(a => (a || '').toLowerCase().trim()).filter(Boolean);
    const { intent } = this.matchIntent(norm, alts);
    if (!this.bargeInIntents.has(intent)) return false;

    console.log(`[VOICE] Command while speaking: ${intent}`);
    window.SoundSightTTS?.stop();
    this.processCommand(finalText, alternatives);
    return true;
  }

  processCommand(rawText, alternatives = []) {
    const text = (rawText || '').trim();
    if (!text) return;
    const norm = text.toLowerCase();
    const normAlternatives = alternatives.map(a => (a || '').toLowerCase().trim()).filter(Boolean);

    // Anti-echo gate during TTS (covers the case where processCommand is
    // called directly, e.g. from the simulated-voice text box)
    if (this.isTtsActive()) {
      if (/\b(stop|halt|pause|silence|be quiet|shut up)\b/i.test(norm)) {
        window.SoundSightTTS?.stop();
        this.setState('LISTENING');
      }
      return;
    }

    // Ignore a repeat of the exact same command fired again within ~1.5s.
    // Real-world SpeechRecognition sometimes emits more than one "final"
    // event for a single utterance (especially near a restart), which
    // used to open the camera / retrigger actions two or three times.
    const now = Date.now();
    if (norm === this.lastCommandText && (now - this.lastCommandTime) < 1500) {
      console.log(`[VOICE] Ignoring duplicate command within debounce window: "${norm}"`);
      return;
    }
    // While a command is actively being dispatched, ignore anything new
    // until it's done — prevents overlapping camera-open / navigation calls.
    if (this.isProcessingCommand) {
      console.log(`[VOICE] Busy handling a previous command, ignoring: "${norm}"`);
      return;
    }
    this.lastCommandText = norm;
    this.lastCommandTime = now;
    this.isProcessingCommand = true;

    // Provide acoustic feedback
    if (window.SoundSightEarcons) {
      window.SoundSightEarcons.commandChime();
    }

    this.setState('COMMAND_DETECTED');

    const { intent, payload } = this.matchIntent(norm, normAlternatives);

    const actionMap = {
      'SCAN': 'OPEN_SCANNER',
      'HISTORY': 'OPEN_HISTORY',
      'REVISE': 'OPEN_REVISION',
      'HELP': 'OPEN_HELP',
      'SETTINGS': 'OPEN_SETTINGS',
      'HOME': 'OPEN_HOME',
      'BACK': 'GO_BACK',
      'START': 'START_SOUNDSIGHT',
      'EXPLAIN': 'START_EXPLANATION',
      'STOP': 'STOP_SPEECH',
      'PAUSE': 'PAUSE_SPEECH',
      'CONTINUE': 'CONTINUE_SPEECH',
      'REPEAT': 'REPEAT_SPEECH',
    };
    const actionName = actionMap[intent] || intent;

    console.log(`[VOICE] Final transcript: ${text}`);
    console.log(`[VOICE] Normalized transcript: ${norm}`);
    console.log(`[VOICE] Detected intent: ${intent}`);
    console.log(`[VOICE] Executing action: ${actionName}`);

    this.dispatch(intent, payload);

    // Return to LISTENING if not processing or speaking
    setTimeout(() => {
      if (this.state === 'COMMAND_DETECTED') {
        this.setState('LISTENING');
      }
    }, 400);

    // Release the busy-lock a beat later so a genuinely new command
    // (not a duplicate echo of this same one) can still get through soon.
    setTimeout(() => {
      this.isProcessingCommand = false;
    }, 600);
  }

  dispatch(intent, payload) {
    if (this.commandHandlers[intent]) {
      this.commandHandlers[intent](payload);
      return;
    }
    const actionMap = {
      'OPEN_SCANNER': 'SCAN',
      'OPEN_HISTORY': 'HISTORY',
      'OPEN_REVISION': 'REVISE',
      'OPEN_HELP': 'HELP',
      'OPEN_SETTINGS': 'SETTINGS',
      'OPEN_HOME': 'HOME',
      'GO_BACK': 'BACK',
      'SCAN': 'OPEN_SCANNER',
      'HISTORY': 'OPEN_HISTORY',
      'REVISE': 'OPEN_REVISION',
      'HELP': 'OPEN_HELP',
      'SETTINGS': 'OPEN_SETTINGS',
      'HOME': 'OPEN_HOME',
      'BACK': 'GO_BACK'
    };
    const alt = actionMap[intent];
    if (alt && this.commandHandlers[alt]) {
      this.commandHandlers[alt](payload);
      return;
    }
    console.log('[VoiceManager] Unhandled intent:', intent, payload);
  }

  updateStateUI() {
    const dot = document.getElementById('voiceStatusDot');
    const label = document.getElementById('voiceStatusText');
    const micBtn = document.getElementById('micToggleBtn');

    const stateMap = {
      'IDLE': { text: 'Idle', dotClass: 'status-dot idle' },
      'LISTENING': { text: 'Listening', dotClass: 'status-dot listening' },
      'COMMAND_DETECTED': { text: 'Processing', dotClass: 'status-dot processing' },
      'PROCESSING': { text: 'Processing', dotClass: 'status-dot processing' },
      'SPEAKING': { text: 'Speaking', dotClass: 'status-dot speaking' }
    };

    const current = stateMap[this.state] || stateMap['IDLE'];

    if (dot) dot.className = current.dotClass;
    if (label) label.textContent = current.text;

    if (micBtn) {
      const isListening = this.state === 'LISTENING';
      micBtn.setAttribute('aria-pressed', isListening.toString());
      if (isListening) {
        micBtn.classList.add('active');
      } else {
        micBtn.classList.remove('active');
      }
    }
  }

  updateTranscriptUI(text, isFinal) {
    const el = document.getElementById('voiceTranscriptLive');
    if (el) {
      el.textContent = text ? `“${text}”` : '';
      if (isFinal) {
        el.classList.add('transcript-final');
      } else {
        el.classList.remove('transcript-final');
      }
    }
  }
}

window.SoundSightVoiceManager = new SoundSightVoiceManager();
console.log("[VOICE] Voice manager loaded");