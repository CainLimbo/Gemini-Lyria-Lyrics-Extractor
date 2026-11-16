(() => {
  const collectedLines = [];
  const seenSet = new Set();

  const uiNoise = new Set([
    "play", "pause", "mute", "unmute", "download", "share",
    "fullscreen", "exit fullscreen", "more options", "captions",
    "subtitles", "lyrics", "copy lyrics", "save .txt", "gemini"
  ]);

  function querySelectorAllDeep(selector, root = document) {
    const results = Array.from(root.querySelectorAll(selector));
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot) {
        results.push(...querySelectorAllDeep(selector, el.shadowRoot));
      }
    }
    return results;
  }

  function addLine(line) {
    const clean = line.trim();
    if (!clean || clean.length < 3 || clean.length > 140) return false;
    if (uiNoise.has(clean.toLowerCase())) return false;
    if (/^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})?$/.test(clean)) return false;

    if (!seenSet.has(clean)) {
      seenSet.add(clean);
      collectedLines.push(clean);
      // If running inside an iframe, also post the line up to the top window
      if (window !== window.top) {
        window.top.postMessage({ type: "LYRIA_LYRIC_LINE", line: clean }, "*");
      }
      return true;
    }
    return false;
  }

  /**
   * Scans <video> TextTracks AND live caption elements inside player cards.
   */
  function scanForLyrics() {
    // 1. Check any HTML5 <video> textTracks
    const videos = querySelectorAllDeep("video");
    for (const video of videos) {
      const tracks = Array.from(video.textTracks || []);
      for (const track of tracks) {
        if (track.mode === "disabled") track.mode = "hidden";
        if (track.cues) {
          for (const cue of Array.from(track.cues)) {
            cue.text.replace(/<[^>]+>/g, "").split("\n").forEach(addLine);
          }
        }
      }
    }

    // 2. Check visible lyric/caption overlay elements near media players
    const candidates = querySelectorAllDeep(
      '[class*="lyric" i], [class*="caption" i], [class*="subtitle" i], [class*="cue" i], video ~ div, video ~ span'
    );
    for (const el of candidates) {
      if (el.closest(".lyria-extractor-bar")) continue;
      const text = (el.innerText || el.textContent || "").trim();
      if (text) {
        text.split("\n").forEach(addLine);
      }
    }
  }

  // Only render the visible floating UI bar in the top-level tab (not inside hidden iframes)
  if (window === window.top) {
    const bar = document.createElement("div");
    bar.className = "lyria-extractor-bar";

    const label = document.createElement("span");
    label.className = "lyria-extractor-label";
    label.textContent = "♪ Lyrics (0)";

    const copyBtn = document.createElement("button");
    copyBtn.className = "lyria-extractor-btn";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy Lyrics";

    const dlBtn = document.createElement("button");
    dlBtn.className = "lyria-extractor-btn secondary";
    dlBtn.type = "button";
    dlBtn.textContent = "Save .txt";

    const clearBtn = document.createElement("button");
    clearBtn.className = "lyria-extractor-btn secondary";
    clearBtn.type = "button";
    clearBtn.textContent = "Reset";

    function updateCounter() {
      label.textContent = `♪ Lyrics (${collectedLines.length})`;
    }

    // Listen for lyric lines sent from embedded iframes
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "LYRIA_LYRIC_LINE") {
        addLine(event.data.line);
        updateCounter();
      }
    });

    copyBtn.addEventListener("click", async () => {
      scanForLyrics();
      updateCounter();
      if (collectedLines.length === 0) {
        copyBtn.textContent = "No lyrics detected yet";
        setTimeout(() => (copyBtn.textContent = "Copy Lyrics"), 2000);
        return;
      }
      await navigator.clipboard.writeText(collectedLines.join("\n"));
      copyBtn.textContent = `Copied (${collectedLines.length})!`;
      setTimeout(() => (copyBtn.textContent = "Copy Lyrics"), 1800);
    });

    dlBtn.addEventListener("click", () => {
      scanForLyrics();
      updateCounter();
      if (collectedLines.length === 0) {
        dlBtn.textContent = "Empty!";
        setTimeout(() => (dlBtn.textContent = "Save .txt"), 2000);
        return;
      }
      const blob = new Blob([collectedLines.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lyria-lyrics.txt";
      a.click();
      URL.revokeObjectURL(url);
    });

    clearBtn.addEventListener("click", () => {
      collectedLines.length = 0;
      seenSet.clear();
      updateCounter();
    });

    bar.append(label, copyBtn, dlBtn, clearBtn);
    document.body.appendChild(bar);

    setInterval(() => {
      scanForLyrics();
      updateCounter();
    }, 800);
  } else {
    // Inside child iframes, poll for lyrics and send them to the top window
    setInterval(scanForLyrics, 800);
  }
})();