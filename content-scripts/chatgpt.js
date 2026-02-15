let hasResponded = false;
let messageCountAtQuestion = 0;
let observationStartTime = 0;
let observationTimeout = null;
let observer = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "receiveQuestion") {
    resetObservation();

    const messages = document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );
    messageCountAtQuestion = messages.length;
    hasResponded = false;

    insertQuestion(message.question)
      .then(() => {
        sendResponse({ received: true, status: "processing" });
      })
      .catch((error) => {
        sendResponse({ received: false, error: error.message });
      });

    return true;
  }
});

function resetObservation() {
  hasResponded = false;
  if (observationTimeout) {
    clearTimeout(observationTimeout);
    observationTimeout = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function buildPromptText(questionData, mode) {
  const { type, question, options } = questionData;
  let text = `Type: ${type}\nQuestion: ${question}`;

  if (type === "matching" && options?.prompts && options?.choices) {
    text +=
      "\nPrompts:\n" +
      options.prompts.map((prompt, i) => `${i + 1}. ${prompt}`).join("\n");
    text +=
      "\nChoices:\n" +
      options.choices.map((choice, i) => `${i + 1}. ${choice}`).join("\n");
  } else if (options && Array.isArray(options) && options.length > 0) {
    text += "\nOptions:\n" + options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
  }

  if (mode === "study") {
    text +=
      "\n\nStudy Mode: Act like a tutor and teach me how to solve this problem step by step. If it is a conceptual problem, clearly explain the underlying concept in simple terms and why it applies. If it is an equation-based problem, show every step of the math.";
    return text;
  }

  if (type === "matching") {
    text +=
      "\n\nPlease match each prompt with the correct choice. Format your answer as an array where each element is 'Prompt -> Choice'.";
  } else if (type === "fill_in_the_blank") {
    text +=
      "\n\nThis is a fill in the blank question. If there are multiple blanks, provide answers as an array in order of appearance. For a single blank, you can provide a string.";
  } else if (options && Array.isArray(options) && options.length > 0) {
    text +=
      "\n\nIMPORTANT: Your answer must EXACTLY match one of the above options. Do not include numbers in your answer. If there are periods, include them.";
  }

  text +=
    '\n\nPlease provide your answer in JSON format with keys "answer" and "explanation". Explanations should be no more than one sentence.';

  text +=
    "\n\nIMPORTANT: The answer must be a numeric value with units. If needed, use decimal form or a simplified fraction. Always include units, and do not add extra text.";

  return text;
}

async function insertQuestion(questionData) {
  const { hasImage } = questionData;
  const mode = questionData.mode === "study" ? "study" : "assist";
  const shouldObserveForAutofill = mode === "assist";
  const text = buildPromptText(questionData, mode);

  return new Promise((resolve, reject) => {
    const inputArea = document.getElementById("prompt-textarea");
    if (inputArea) {
      setTimeout(() => {
        inputArea.focus();
        inputArea.innerHTML = `<p>${text}</p>`;
        inputArea.dispatchEvent(new Event("input", { bubbles: true }));

        setTimeout(() => {
          const sendButton = document.querySelector(
            '[data-testid="send-button"]'
          );
          if (sendButton) {
            if (hasImage) {
              alert(
                mode === "study"
                  ? "ChatGPT: Image detected in Study Mode. Drag the image from the opened tab, then press Enter or click Send."
                  : "ChatGPT: Image detected. Drag the image from the opened tab, then press Enter or click Send."
              );
              armManualSendObserver(
                inputArea,
                sendButton,
                shouldObserveForAutofill
              );
              resolve();
            } else {
              sendButton.click();
              if (shouldObserveForAutofill) {
                startObserving();
              } else {
                chrome.runtime.sendMessage({ type: "closeImageTab" });
              }
              resolve();
            }
          } else {
            reject(new Error("Send button not found"));
          }
        }, 300);
      }, 300);
    } else {
      reject(new Error("Input area not found"));
    }
  });
}

function armManualSendObserver(inputArea, sendButton, shouldObserveForAutofill) {
  const startOnce = (() => {
    let started = false;
    return () => {
      if (started) return;
      started = true;
      chrome.runtime.sendMessage({ type: "closeImageTab" });
      if (shouldObserveForAutofill) {
        startObserving();
      }
      inputArea.removeEventListener("keydown", onKeydown, true);
      if (sendButton) {
        sendButton.removeEventListener("click", onClick, true);
      }
      document.removeEventListener("click", onDocClick, true);
    };
  })();

  const onKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      startOnce();
    }
  };
  const onClick = () => startOnce();
  const onDocClick = (e) => {
    const target = e.target;
    if (!target) return;
    const btn = target.closest(
      '[data-testid="send-button"], button[type="submit"]'
    );
    if (btn) startOnce();
  };

  inputArea.addEventListener("keydown", onKeydown, true);
  if (sendButton) {
    sendButton.addEventListener("click", onClick, true);
  }
  document.addEventListener("click", onDocClick, true);
}

function startObserving() {
  observationStartTime = Date.now();
  observationTimeout = setTimeout(() => {
    if (!hasResponded) {
      resetObservation();
    }
  }, 180000);

  observer = new MutationObserver(() => {
    if (hasResponded) return;

    const messages = document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );
    if (!messages.length) return;

    if (messages.length <= messageCountAtQuestion) return;

    const latestMessage = messages[messages.length - 1];
    const codeBlocks = latestMessage.querySelectorAll("pre code");
    let responseText = "";

    for (const block of codeBlocks) {
      if (block.className.includes("language-json")) {
        responseText = block.textContent.trim();
        break;
      }
    }

    if (!responseText) {
      responseText = latestMessage.textContent.trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) responseText = jsonMatch[0];
    }

    responseText = responseText
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\n\s*/g, " ")
      .trim();

    try {
      const parsed = JSON.parse(responseText);
      if (parsed.answer && !hasResponded) {
        hasResponded = true;
        chrome.runtime
          .sendMessage({
            type: "chatGPTResponse",
            response: responseText,
          })
          .then(() => {
            resetObservation();
          })
          .catch(() => {});
      }
    } catch (e) {
      const isGenerating = latestMessage.querySelector(".result-streaming");
      if (!isGenerating && Date.now() - observationStartTime > 30000) {
        const fallbackText = latestMessage.textContent.trim();
        try {
          const jsonPattern =
            /\{[\s\S]*?"answer"[\s\S]*?"explanation"[\s\S]*?\}/;
          const jsonMatch = fallbackText.match(jsonPattern);

          if (jsonMatch && !hasResponded) {
            hasResponded = true;
            chrome.runtime.sendMessage({
              type: "chatGPTResponse",
              response: jsonMatch[0],
            });
            resetObservation();
          }
        } catch (e) {}
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

