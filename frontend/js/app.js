/**
 * SoundSight Main Application Coordinator
 * Minimal Premium Accessible UI implementation
 */

class SoundSightApp {
  constructor() {
    this.currentView = 'welcome'; // welcome | dashboard | scanner | processing | explanation | history | revision
    this.currentAnalysis = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.setupVoiceCommands();
    this.setupAccessibilityShortcuts();
    this.renderBenchmarkCards();

    // Belt-and-braces on top of the button's `autofocus` attribute: some
    // browsers skip autofocus if it fires before layout settles. A blind
    // user's screen reader announces whatever is focused the instant the
    // page loads, so this one line is what makes the whole page
    // discoverable without any exploration.
    const startBtn = document.getElementById('startSoundSightBtn');
    if (startBtn) {
      setTimeout(() => startBtn.focus(), 50);
    }
  }

  bindEvents() {
    // Welcome Start Button
    const startBtn = document.getElementById('startSoundSightBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startSoundSight());
    }

    // Mic Toggle Button
    const micBtn = document.getElementById('micToggleBtn');
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (window.SoundSightVoiceManager) {
          window.SoundSightVoiceManager.toggleListening();
        }
      });
    }

    // Dashboard Cards (6 Large Minimal Cards)
    document.getElementById('cardScan')?.addEventListener('click', () => this.openScanner());
    document.getElementById('cardUpload')?.addEventListener('click', () => this.triggerUpload());
    document.getElementById('cardHistory')?.addEventListener('click', () => this.openHistory());
    document.getElementById('cardRevise')?.addEventListener('click', () => this.openRevision());
    document.getElementById('cardHelp')?.addEventListener('click', () => this.openHelp());
    document.getElementById('cardSettings')?.addEventListener('click', () => this.openSettings());

    // File Upload Input
    const fileInput = document.getElementById('fileUploadInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    // Audio Playback Control Buttons
    document.getElementById('btnAudioExplain')?.addEventListener('click', () => this.startExplanation());
    document.getElementById('btnAudioStop')?.addEventListener('click', () => {
      window.SoundSightTTS?.stop();
    });
    document.getElementById('btnAudioPause')?.addEventListener('click', () => {
      window.SoundSightTTS?.pause();
    });
    document.getElementById('btnAudioResume')?.addEventListener('click', () => {
      window.SoundSightTTS?.resume();
    });
    document.getElementById('btnAudioRepeat')?.addEventListener('click', () => {
      window.SoundSightTTS?.repeat();
    });
    document.getElementById('btnAudioSlow')?.addEventListener('click', () => {
      window.SoundSightTTS?.goSlow();
    });
    document.getElementById('btnAudioNormal')?.addEventListener('click', () => {
      window.SoundSightTTS?.normalSpeed();
    });
    document.getElementById('btnAudioFast')?.addEventListener('click', () => {
      window.SoundSightTTS?.goFaster();
    });

    // Navigation Buttons (Return to Dashboard)
    document.querySelectorAll('.btn-nav-home').forEach(btn => {
      btn.addEventListener('click', () => this.goToDashboard());
    });

    // Close Scanner Button
    document.getElementById('btnCloseScanner')?.addEventListener('click', () => {
      window.SoundSightCameraScanner?.stop();
      this.goToDashboard();
    });

    // Modal Close Buttons
    document.getElementById('btnCloseHelp')?.addEventListener('click', () => this.closeModals());
    document.getElementById('btnCloseSettings')?.addEventListener('click', () => this.closeModals());

    // Benchmark Drawer Toggle Button
    document.getElementById('btnToggleBenchmarks')?.addEventListener('click', () => {
      const container = document.getElementById('benchmarkListings');
      const btn = document.getElementById('btnToggleBenchmarks');
      if (container) {
        const isHidden = container.classList.toggle('hidden');
        if (btn) btn.setAttribute('aria-expanded', (!isHidden).toString());
      }
    });

    // Simulated Voice Command Form
    const simForm = document.getElementById('simVoiceForm');
    const simInput = document.getElementById('simVoiceInput');
    if (simForm && simInput) {
      simForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = simInput.value.trim();
        if (val) {
          window.SoundSightVoiceManager?.processCommand(val);
          simInput.value = '';
        }
      });
    }

    // Revision Mode Buttons
    document.getElementById('btnRevQuick')?.addEventListener('click', () => {
      window.SoundSightRevisionManager?.selectMode('quick');
    });
    document.getElementById('btnRevDetailed')?.addEventListener('click', () => {
      window.SoundSightRevisionManager?.selectMode('detailed');
    });
    document.getElementById('btnRevExam')?.addEventListener('click', () => {
      window.SoundSightRevisionManager?.selectMode('exam');
    });
    document.getElementById('btnRevQuestion')?.addEventListener('click', () => {
      window.SoundSightRevisionManager?.selectMode('question');
    });
  }

  setupVoiceCommands() {
    const vm = window.SoundSightVoiceManager;
    if (!vm) return;

    vm.registerCommand('START', () => this.startSoundSight());
    vm.registerCommand('START_SOUNDSIGHT', () => this.startSoundSight());

    vm.registerCommand('SCAN', () => this.openScanner());
    vm.registerCommand('OPEN_SCANNER', () => this.openScanner());

    vm.registerCommand('UPLOAD', () => this.triggerUpload());
    vm.registerCommand('TRIGGER_UPLOAD', () => this.triggerUpload());

    vm.registerCommand('HISTORY', () => this.openHistory());
    vm.registerCommand('OPEN_HISTORY', () => this.openHistory());

    vm.registerCommand('OPEN_ITEM', (text) => window.SoundSightHistoryManager?.openItemByVoice(text));

    vm.registerCommand('REVISE', (topic) => window.SoundSightRevisionManager?.handleReviseCommand(topic));
    vm.registerCommand('OPEN_REVISION', (topic) => window.SoundSightRevisionManager?.handleReviseCommand(topic));
    vm.registerCommand('REVISE_MODE', (mode) => window.SoundSightRevisionManager?.selectMode(mode));

    vm.registerCommand('EXPLAIN', () => this.startExplanation());
    vm.registerCommand('START_EXPLANATION', () => this.startExplanation());
    vm.registerCommand('EXPLAIN_AGAIN', () => this.startExplanation());

    vm.registerCommand('STOP', () => window.SoundSightTTS?.stop());
    vm.registerCommand('STOP_SPEECH', () => window.SoundSightTTS?.stop());

    vm.registerCommand('PAUSE', () => window.SoundSightTTS?.pause());
    vm.registerCommand('PAUSE_SPEECH', () => window.SoundSightTTS?.pause());

    vm.registerCommand('CONTINUE', () => window.SoundSightTTS?.resume());
    vm.registerCommand('CONTINUE_SPEECH', () => window.SoundSightTTS?.resume());

    vm.registerCommand('REPEAT', () => window.SoundSightTTS?.repeat());
    vm.registerCommand('REPEAT_SPEECH', () => window.SoundSightTTS?.repeat());

    vm.registerCommand('GO_SLOW', () => window.SoundSightTTS?.goSlow());
    vm.registerCommand('GO_FASTER', () => window.SoundSightTTS?.goFaster());
    vm.registerCommand('NORMAL_SPEED', () => window.SoundSightTTS?.normalSpeed());

    vm.registerCommand('HELP', () => this.openHelp());
    vm.registerCommand('OPEN_HELP', () => this.openHelp());

    vm.registerCommand('SETTINGS', () => this.openSettings());
    vm.registerCommand('OPEN_SETTINGS', () => this.openSettings());

    vm.registerCommand('HOME', () => this.goToDashboard());
    vm.registerCommand('OPEN_HOME', () => this.goToDashboard());

    vm.registerCommand('BACK', () => this.goToDashboard());
    vm.registerCommand('GO_BACK', () => this.goToDashboard());

    // Freeform voice input (used for Question Mode verbal answers)
    vm.registerCommand('FREEFORM', (text) => {
      if (window.SoundSightRevisionManager && window.SoundSightRevisionManager.isAwaitingAnswer) {
        window.SoundSightRevisionManager.submitStudentAnswer(text);
      }
    });
  }

  setupAccessibilityShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Spacebar toggles listening (if not currently focused on text input)
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        window.SoundSightVoiceManager?.toggleListening();
        return;
      }

      // Escape stops speech or exits scanner/modals
      if (e.key === 'Escape') {
        window.SoundSightTTS?.stop();
        if (this.currentView === 'scanner') {
          window.SoundSightCameraScanner?.stop();
          this.goToDashboard();
        } else {
          this.closeModals();
        }
        return;
      }

      // Top-level Dashboard 1-6 keys
      if (this.currentView === 'dashboard') {
        if (e.key === '1') this.openScanner();
        if (e.key === '2') this.triggerUpload();
        if (e.key === '3') this.openHistory();
        if (e.key === '4') this.openRevision();
        if (e.key === '5') this.openHelp();
        if (e.key === '6') this.openSettings();
      }
    });
  }

  switchView(viewName) {
    document.getElementById('uploadPromptBtn')?.remove();
    this.currentView = viewName;
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active-view');
      sec.setAttribute('aria-hidden', 'true');
    });

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
      activeSec.classList.add('active-view');
      activeSec.setAttribute('aria-hidden', 'false');
      activeSec.focus();
    }
  }

  async startSoundSight() {
    window.SoundSightEarcons?.init();
    this.switchView('dashboard');

    // Start the mic immediately, inside this same click/Enter press. It must
    // never wait for speech to finish first: if speech ever hiccups, the mic
    // would otherwise never start and a blind user couldn't recover.
    window.SoundSightVoiceManager?.startListening();

    // Browsers remember the microphone choice per site, so after the first
    // time there is nothing to explain and nothing to press.
    let micAlreadyAllowed = false;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        micAlreadyAllowed = status.state === 'granted';
      }
    } catch (e) {
      // Permissions API not available for the microphone in this browser
    }

    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak(
        micAlreadyAllowed
          ? "SoundSight is ready. You can say Scan, Upload, History, Revision or Help."
          : "Starting SoundSight. Your browser is asking to allow microphone access. " +
            "Press Tab, then Enter, to allow it. SoundSight will remember your choice and will not ask again. " +
            "Then you can say Scan, Upload, History, Revision or Help."
      );
    }
  }

  goToDashboard() {
    this.closeModals();
    window.SoundSightCameraScanner?.stop();
    window.SoundSightTTS?.stop();
    this.switchView('dashboard');
    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak("SoundSight is ready. You can say Scan, Upload, History, Revision or Help.");
    }
  }

  async openScanner() {
    // If the scanner is already open/starting, don't restart it — this is
    // what used to happen when a voice command fired more than once for
    // the same "Scan" utterance.
    if (window.SoundSightCameraScanner?.isRunning || window.SoundSightCameraScanner?.isStarting) {
      return;
    }
    window.SoundSightTTS?.stop();
    this.switchView('scanner');

    const videoEl = document.getElementById('cameraVideo');
    const canvasEl = document.getElementById('scannerCanvas');

    if (!window.SoundSightCameraScanner) return;

    window.SoundSightCameraScanner.init(videoEl, canvasEl, (capturedImageData) => {
      this.handleCaptureComplete(capturedImageData);
    });

    try {
      await window.SoundSightCameraScanner.start();
    } catch (e) {
      console.error('Camera failed to start:', e);
    }
  }

  triggerUpload() {
    window.SoundSightTTS?.stop();
    const fileInput = document.getElementById('fileUploadInput');
    if (!fileInput) return;

    // Browsers only open a file dialog straight after a real key press or
    // click - never from a voice command. If we do happen to have a fresh
    // activation, use it; otherwise show one big focused button so the user
    // is a single Enter press away from the file dialog.
    if (navigator.userActivation && navigator.userActivation.isActive) {
      fileInput.click();
      return;
    }
    this.showUploadPrompt(fileInput);
  }

  showUploadPrompt(fileInput) {
    document.getElementById('uploadPromptBtn')?.remove();

    const btn = document.createElement('button');
    btn.id = 'uploadPromptBtn';
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = '📁 Press Enter to choose a file';
    btn.setAttribute('aria-label', 'Choose a file to upload. Press Enter or Space. Press Escape to cancel.');
    btn.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'width:min(90vw,560px);height:180px;font-size:30px;z-index:9999;';

    const close = () => btn.remove();
    btn.addEventListener('click', () => {
      close();
      fileInput.click(); // real click = real user activation, so this is allowed
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
        window.SoundSightTTS?.speak('Upload cancelled.');
      }
    });

    document.body.appendChild(btn);
    btn.focus();
    window.SoundSightTTS?.speak('Ready to upload. Press Enter or Space to choose a file. Press Escape to cancel.');
  }

  handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak("Image uploaded. I will analyze it now.");
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target.result;
      this.startProcessingPipeline(imageData, { fileName: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  handleCaptureComplete(imageData) {
    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak("Your content has been captured. Please wait while I analyze it.");
    }
    this.startProcessingPipeline(imageData, { source: 'camera' });
  }

  async startProcessingPipeline(imageData, meta = {}) {
    this.switchView('processing');
    
    // Simple 5-step sequence matching requirement:
    // Detecting content -> Improving image -> Reading content -> Understanding content -> Preparing explanation
    const steps = [
      { text: "Detecting content", audio: "Detecting content." },
      { text: "Improving image", audio: "Improving image contrast." },
      { text: "Reading content", audio: "Reading content text." },
      { text: "Understanding content", audio: "Understanding STEM structure." },
      { text: "Preparing explanation", audio: "Preparing explanation." }
    ];

    const stepElements = document.querySelectorAll('.proc-step-item');
    const updateStep = (index) => {
      stepElements.forEach((el, i) => {
        if (i < index) {
          el.className = 'proc-step-item complete';
        } else if (i === index) {
          el.className = 'proc-step-item active';
        } else {
          el.className = 'proc-step-item';
        }
      });
      const liveRegion = document.getElementById('processingLiveStatus');
      if (liveRegion) liveRegion.textContent = steps[index].text;
    };

    // Step 0: Detecting content
    updateStep(0);
    if (window.SoundSightTTS) window.SoundSightTTS.speak(steps[0].audio);
    await new Promise(r => setTimeout(r, 400));

    // Step 1: Improving image
    updateStep(1);
    if (window.SoundSightTTS) window.SoundSightTTS.speak(steps[1].audio);

    // Call STEM Analyzer with progress callbacks
    let rawText = meta.rawText || '';
    const analysis = await window.SoundSightStemAnalyzer.analyzeContent({
      rawText,
      imageData,
      meta,
      onProgress: (stage) => {
        if (stage === 'ocr') {
          updateStep(2);
          if (window.SoundSightTTS) window.SoundSightTTS.speak(steps[2].audio);
        } else if (stage === 'stem') {
          updateStep(3);
          if (window.SoundSightTTS) window.SoundSightTTS.speak(steps[3].audio);
        }
      }
    });

    // Step 4: Preparing explanation
    updateStep(4);
    if (window.SoundSightTTS) window.SoundSightTTS.speak(steps[4].audio);
    await new Promise(r => setTimeout(r, 400));

    this.currentAnalysis = analysis;

    // Save to learning history automatically only if valid
    if (!analysis.isError && window.SoundSightHistoryManager) {
      window.SoundSightHistoryManager.saveItem(analysis);
    }

    this.displayExplanation(analysis);

    if (window.SoundSightEarcons) {
      if (analysis.isError) {
        window.SoundSightEarcons.errorTone();
      } else {
        window.SoundSightEarcons.analysisCompleteChime();
      }
    }

    if (window.SoundSightTTS) {
      if (analysis.isError) {
        window.SoundSightTTS.speak(analysis.message || "I could not detect readable content. Please hold the document steady and try again.");
      } else {
        window.SoundSightTTS.speak("Analysis complete. Say Explain when you are ready.");
      }
    }
  }

  displayExplanation(item) {
    this.currentAnalysis = item;
    this.switchView('explanation');

    const errBanner = document.getElementById('expErrorBanner');
    const codeWrapper = document.getElementById('expDetectedCodeWrapper');
    const codeBlock = document.getElementById('expDetectedCodeBlock');
    const summarySec = document.getElementById('expSummarySection');
    const keyPointsSec = document.getElementById('expKeyPointsSection');
    const structContainer = document.getElementById('expStructureContainer');

    if (item.isError) {
      if (errBanner) {
        errBanner.textContent = item.message || item.error || "Unable to read content clearly from scan.";
        errBanner.classList.remove('hidden');
      }
      document.getElementById('expTitle').textContent = "Scan Unclear";
      document.getElementById('expTopic').textContent = "Camera Quality & Lighting";
      document.getElementById('expContentType').textContent = "Unclear";
      document.getElementById('expConfidence').textContent = "Low Confidence";

      if (codeWrapper) codeWrapper.classList.add('hidden');
      if (summarySec) summarySec.classList.add('hidden');
      if (keyPointsSec) keyPointsSec.classList.add('hidden');
      if (structContainer) structContainer.innerHTML = '';
      return;
    }

    if (errBanner) errBanner.classList.add('hidden');
    if (summarySec) summarySec.classList.remove('hidden');
    if (keyPointsSec) keyPointsSec.classList.remove('hidden');

    document.getElementById('expTitle').textContent = item.title;
    document.getElementById('expTopic').textContent = item.topic;
    document.getElementById('expContentType').textContent = item.contentType === 'Code' ? `${item.language || 'Python'} Code` : item.contentType;
    document.getElementById('expConfidence').textContent = `${Math.round((item.confidence || 0.95) * 100)}% Confidence`;

    // Render Detected Code Block if Code
    if (item.contentType === 'Code' && codeBlock) {
      codeBlock.textContent = item.ocrText || '';
      if (codeWrapper) codeWrapper.classList.remove('hidden');
    } else if (codeWrapper) {
      codeWrapper.classList.add('hidden');
    }

    // Short Summary
    const summaryEl = document.getElementById('expSummaryText');
    if (summaryEl) {
      summaryEl.textContent = item.purpose || item.summary || item.overallLogic || "STEM educational content.";
    }

    // Key Points
    const keyPointsEl = document.getElementById('expKeyPointsList');
    if (keyPointsEl) {
      const points = item.keyPoints || [item.title, item.topic];
      keyPointsEl.innerHTML = points.map(p => `<li>${p}</li>`).join('');
    }

    // Structural Breakdown Container
    if (structContainer) {
      structContainer.innerHTML = this.buildStructureHTML(item);
    }
  }

  buildStructureHTML(item) {
    const cType = item.contentType;
    let html = '';

    if (cType === 'Code') {
      html += `
        <h3>Code Logic</h3>
        <p><strong>Language:</strong> ${item.language || 'Python'}</p>
        <p><strong>Algorithmic Logic:</strong> ${item.overallLogic || ''}</p>
        <h4>Line by Line:</h4>
        <ol>${(item.lineByLine || []).map(l => `<li>${l}</li>`).join('')}</ol>
        ${item.errors && item.errors.length > 0 ? `
          <p style="color: var(--accent-primary); margin-top: 10px;">
            <strong>Optimization Tip:</strong> ${item.errors[0].fix}
          </p>
        ` : ''}
      `;
    } else if (cType === 'Flowchart') {
      html += `
        <h3>Flowchart Structure</h3>
        <ol>${(item.structuralFlow || []).map(s => `<li>${s}</li>`).join('')}</ol>
      `;
    } else if (cType === 'Formula') {
      html += `
        <h3>Formula & Spoken Phonetics</h3>
        <p style="font-family: var(--font-mono); font-size: 22px; color: var(--accent-primary); margin-bottom: 8px;">
          ${item.latex || item.ocrText}
        </p>
        <p><strong>Spoken Reading:</strong> “${item.spokenMath || ''}”</p>
        <h4>Symbols:</h4>
        <ul>${(item.symbols || []).map(s => `<li><strong>${s.symbol}</strong> (${s.name}): ${s.meaning}</li>`).join('')}</ul>
      `;
    } else if (cType === 'Diagram') {
      html += `
        <h3>Diagram Components</h3>
        <p><strong>Spatial Layout:</strong> ${item.spatialLayout || ''}</p>
        <ul>${(item.components || []).map(c => `<li><strong>${c.name}</strong>: ${c.description}</li>`).join('')}</ul>
      `;
    }

    return html;
  }

  startExplanation() {
    if (!this.currentAnalysis) return;
    const script = this.currentAnalysis.audioScript;
    if (window.SoundSightTTS && script) {
      window.SoundSightTTS.speakExplanation(script);
    }
  }

  openHistory() {
    window.SoundSightTTS?.stop();
    this.switchView('history');

    const container = document.getElementById('historyCardsContainer');
    const items = window.SoundSightHistoryManager ? window.SoundSightHistoryManager.items : [];

    if (container) {
      if (items.length === 0) {
        container.innerHTML = `
          <div class="history-empty-box">
            <img src="assets/study_workspace.jpg" alt="Organized student study desk" class="history-empty-img" />
            <p class="history-empty-text">No saved learning items yet.</p>
            <p class="history-empty-sub">Say “Scan” or click Scan to analyze your first STEM document.</p>
            <button class="btn btn-primary btn-sm" onclick="SoundSightApp.openScanner()">📷 Scan Now</button>
          </div>
        `;
      } else {
        container.innerHTML = items.map((it, idx) => `
          <div class="history-topic-card" tabindex="0" role="button" aria-label="Item ${idx + 1}: ${it.title}. ${it.topic}.">
            <div class="history-card-info">
              <span class="history-card-title">${it.title}</span>
              <span class="history-card-topic">${it.topic} • ${it.contentType}</span>
              <span class="history-card-date">Scanned • ${new Date(it.timestamp).toLocaleDateString()}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="SoundSightHistoryManager.openItemByVoice('item ${idx + 1}')">
              Open
            </button>
          </div>
        `).join('');
      }
    }

    if (window.SoundSightHistoryManager) {
      window.SoundSightHistoryManager.announceHistory();
    }
  }

  openRevision() {
    window.SoundSightTTS?.stop();
    const items = window.SoundSightHistoryManager ? window.SoundSightHistoryManager.items : [];
    if (items.length > 0) {
      window.SoundSightRevisionManager?.handleReviseCommand(items[0].title);
    } else {
      this.switchView('revision');
      const container = document.getElementById('revisionContentDisplay');
      if (container) {
        container.innerHTML = `<p style="color: var(--text-muted);">No learning items in history yet. Please scan or upload content first.</p>`;
      }
      if (window.SoundSightTTS) {
        window.SoundSightTTS.speak("No items in history. Please scan content first to begin revision.");
      }
    }
  }

  displayRevisionView(item) {
    this.switchView('revision');
    const container = document.getElementById('revisionContentDisplay');
    if (container) {
      container.innerHTML = `
        <h4 style="font-size: 24px; color: var(--accent-primary); margin-bottom: 6px;">${item.title}</h4>
        <p style="color: var(--text-secondary); font-size: 17px;">
          Choose a mode above or say: <em>Quick Revision</em>, <em>Detailed Revision</em>, <em>Exam Revision</em>, or <em>Question Mode</em>.
        </p>
      `;
    }
  }

  openHelp() {
    const modal = document.getElementById('helpModal');
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
    const helpSpeech = "You can say Scan to scan content. Upload to upload an image. History to view previous content. Revise followed by a topic to revise it. Settings for accessibility and audio options. Say Stop to stop audio, Repeat to repeat, and Go Slow to slow down.";
    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak(helpSpeech);
    }
  }

  openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak("Settings menu open. You can adjust default speech speed and preferences.");
    }
  }

  closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.classList.remove('active');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  renderBenchmarkCards() {
    const container = document.getElementById('benchmarkListings');
    if (!container || !window.SOUNDSIGHT_BENCHMARKS) return;

    container.innerHTML = window.SOUNDSIGHT_BENCHMARKS.map(bm => `
      <div class="benchmark-card-item" tabindex="0" role="button" onclick="SoundSightApp.loadBenchmark('${bm.id}')" aria-label="Test STEM Benchmark: ${bm.title}">
        <span class="benchmark-card-tag">${bm.contentType}</span>
        <h5 class="benchmark-card-title">${bm.title}</h5>
        <button class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 8px;">
          Test Live Pipeline
        </button>
      </div>
    `).join('');
  }

  loadBenchmark(id) {
    const bm = window.SOUNDSIGHT_BENCHMARKS?.find(b => b.id === id);
    if (!bm) return;

    if (window.SoundSightTTS) {
      window.SoundSightTTS.speak(`Loading ${bm.title} benchmark.`);
    }

    const dataUrl = window.svgToDataUrl(bm.svgContent);
    this.startProcessingPipeline(dataUrl, {
      title: bm.title,
      topic: bm.topic,
      contentTypeHint: bm.contentType,
      rawText: bm.rawText
    });
  }
}

window.SoundSightApp = new SoundSightApp();