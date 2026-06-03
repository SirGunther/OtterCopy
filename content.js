(() => {
  if (window.__OTTERCOPY_LOADED__) return;
  window.__OTTERCOPY_LOADED__ = true;

  const COPY_ACTION = "copyTranscript";
  const EXTRACT_ACTION = "extractTranscript";
  const TOAST_ACTION = "showOtterCopyToast";
  const TOAST_ID = "__ottercopy_toast__";

  const SELECTORS = {
    exactSentence: [
      'div[name="sentence"]',
      'li[name="sentence"]',
      'p[name="sentence"]',
    ].join(", "),
    looseSentence: [
      '[name="sentence"]',
      '[data-testid*="sentence" i]',
      '[class*="sentence" i]',
    ].join(", "),
    contentBody: [
      "div.transcript-snippet__content_body",
      '[class*="transcript-snippet"][class*="content_body"]',
      '[class*="transcript"][class*="content"][class*="body"]',
    ].join(", "),
    word: [
      "span.transcript-snippet__content_body_word",
      '[class*="transcript-snippet"][class*="word"]',
      '[class*="transcript"][class*="word"]',
    ].join(", "),
    transcriptContainer: [
      '[class*="transcript" i]',
      '[data-testid*="transcript" i]',
      '[aria-label*="transcript" i]',
    ].join(", "),
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === EXTRACT_ACTION) {
      const transcriptText = extractTranscriptText();
      sendResponse(
        transcriptText
          ? { ok: true, transcriptText }
          : { ok: false, error: "No transcript text found." },
      );
      return false;
    }

    if (message.action === TOAST_ACTION) {
      showToast(message.message || "Copied.");
      sendResponse({ ok: true });
      return false;
    }

    if (message.action !== COPY_ACTION) return false;

    copyTranscript(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("OtterCopy: copy failed", error);
        showToast("Could not copy transcript.");
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  });

  async function copyTranscript(options = {}) {
    const transcriptText = extractTranscriptText();

    if (!transcriptText) {
      showToast("No transcript text found.");
      return { ok: false, error: "No transcript text found." };
    }

    const textToCopy = formatTranscriptForCopy(transcriptText, options);
    const copied = await writeTextToClipboard(textToCopy);
    if (!copied) {
      showToast("Clipboard blocked. Try again.");
      return { ok: false, error: "Clipboard write failed." };
    }

    showToast(
      options.mode === "refinement"
        ? "Transcript and prompt copied."
        : "Transcript copied.",
    );
    return {
      ok: true,
      characterCount: textToCopy.length,
    };
  }

  function formatTranscriptForCopy(transcriptText, options) {
    if (options.mode !== "refinement") {
      return transcriptText;
    }

    const prompt = cleanText(options.refinementPrompt);
    if (!prompt) {
      return transcriptText;
    }

    return `${prompt}\n\n---\n\nTranscript:\n\n${transcriptText}`;
  }

  function extractTranscriptText() {
    const exactSentenceNodes = getTopLevelElements(
      visibleElements(document.querySelectorAll(SELECTORS.exactSentence)),
    );
    if (exactSentenceNodes.length > 0) {
      return cleanTranscriptLines(exactSentenceNodes.map(extractSentenceText));
    }

    const contentBodyNodes = getTopLevelElements(
      visibleElements(document.querySelectorAll(SELECTORS.contentBody)),
    );
    if (contentBodyNodes.length > 0) {
      return cleanTranscriptLines(contentBodyNodes.map(extractSentenceText));
    }

    const looseSentenceNodes = getTopLevelElements(
      visibleElements(document.querySelectorAll(SELECTORS.looseSentence)).filter(
        isLikelySentenceElement,
      ),
    );
    if (looseSentenceNodes.length > 0) {
      return cleanTranscriptLines(looseSentenceNodes.map(extractSentenceText));
    }

    const transcriptContainers = visibleElements(
      document.querySelectorAll(SELECTORS.transcriptContainer),
    );
    const bestContainer = findBestTranscriptContainer(transcriptContainers);
    if (bestContainer) {
      return cleanText(bestContainer.innerText || bestContainer.textContent);
    }

    return "";
  }

  function extractSentenceText(element) {
    const words = getTopLevelElements(
      visibleElements(element.querySelectorAll(SELECTORS.word)),
    );

    if (words.length > 0) {
      return joinWordTokens(words.map((word) => word.textContent));
    }

    return cleanText(element.innerText || element.textContent);
  }

  function joinWordTokens(tokens) {
    return tokens
      .map((token) => cleanInlineText(token))
      .filter(Boolean)
      .reduce((line, token) => {
        if (!line) return token;
        if (/^[,.;:!?%)]/.test(token)) return `${line}${token}`;
        if (/^['’]/.test(token)) return `${line}${token}`;
        if (/[-/]/.test(token)) return `${line}${token}`;
        if (/[(¿¡]$/.test(line)) return `${line}${token}`;
        return `${line} ${token}`;
      }, "");
  }

  function cleanTranscriptLines(lines) {
    return lines
      .map(cleanText)
      .filter(Boolean)
      .join("\n");
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanInlineText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function visibleElements(elements) {
    return Array.from(elements).filter(isVisible);
  }

  function getTopLevelElements(elements) {
    return elements.filter(
      (element) => !elements.some((other) => other !== element && other.contains(element)),
    );
  }

  function isLikelySentenceElement(element) {
    if (element.matches(SELECTORS.word)) return false;

    const text = cleanInlineText(element.innerText || element.textContent);
    if (!text) return false;

    const childElementCount = element.querySelectorAll("*").length;
    const wordCount = text.split(/\s+/).length;
    return childElementCount > 0 || wordCount > 2;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    if (element.closest("[hidden], [aria-hidden='true']")) {
      return false;
    }

    return element.getClientRects().length > 0;
  }

  function findBestTranscriptContainer(elements) {
    return elements
      .map((element) => ({
        element,
        text: cleanText(element.innerText || element.textContent),
      }))
      .filter(({ text }) => text.length > 0)
      .sort((a, b) => b.text.length - a.text.length)[0]?.element;
  }

  async function writeTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.debug("OtterCopy: navigator.clipboard failed", error);
      }
    }

    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "width: 1px",
      "height: 1px",
      "opacity: 0",
      "pointer-events: none",
    ].join(";");

    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.style.cssText = [
        "position: fixed",
        "bottom: 20px",
        "left: 50%",
        "transform: translateX(-50%)",
        "z-index: 2147483647",
        "max-width: min(420px, calc(100vw - 32px))",
        "padding: 10px 14px",
        "border-radius: 6px",
        "background: #1f2933",
        "color: #ffffff",
        "font: 13px/1.4 Arial, sans-serif",
        "box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2)",
        "opacity: 0",
        "transition: opacity 160ms ease",
      ].join(";");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";

    window.clearTimeout(toast.__ottercopyTimer);
    toast.__ottercopyTimer = window.setTimeout(() => {
      toast.style.opacity = "0";
    }, 1800);
  }
})();
