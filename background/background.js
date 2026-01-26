let imageTabId = null;
let chatgptTabId = null;
let localTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "openImageTab" && message.url) {
    if (imageTabId) {
      chrome.tabs.remove(imageTabId).catch(() => {});
      imageTabId = null;
    }
    chrome.tabs.create({ url: message.url, active: false }, (tab) => {
      if (tab && tab.id) {
        imageTabId = tab.id;
      }
    });
    sendResponse({ received: true });
    return true;
  }

  if (message.type === "closeImageTab") {
    if (imageTabId) {
      chrome.tabs.remove(imageTabId).catch(() => {});
      imageTabId = null;
    }
    sendResponse({ received: true });
    return true;
  }

  if (message.type === "openChatGPTTab") {
    chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chatgptTabId = tabs[0].id;
        if (chatgptTabId) {
          chrome.tabs.update(chatgptTabId, { active: true }).catch(() => {});
        }
        sendResponse({ received: true, tabId: chatgptTabId });
        return;
      }

      chrome.tabs.create(
        { url: "https://chatgpt.com/", active: true },
        (tab) => {
          if (tab && tab.id) {
            chatgptTabId = tab.id;
          }
          sendResponse({ received: true, tabId: tab?.id || null });
        }
      );
    });
    return true;
  }

  if (message.type === "sendQuestionToChatGPT") {
    if (sender.tab && sender.tab.id) {
      localTabId = sender.tab.id;
    }

    const sendToChatGPT = (tabId) => {
      chrome.tabs.sendMessage(tabId, {
        type: "receiveQuestion",
        question: message.question,
      });
    };

    if (chatgptTabId) {
      sendToChatGPT(chatgptTabId);
      sendResponse({ received: true });
      return true;
    }

    chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chatgptTabId = tabs[0].id;
        sendToChatGPT(chatgptTabId);
        sendResponse({ received: true });
      } else {
        sendResponse({ received: false, error: "ChatGPT tab not found" });
      }
    });
    return true;
  }

  if (message.type === "chatGPTResponse") {
    if (!localTabId) {
      sendResponse({ received: false });
      return false;
    }
    chrome.tabs.sendMessage(localTabId, message, () => {
      chrome.tabs.update(localTabId, { active: true }).catch(() => {});
      sendResponse({ received: true });
    });
    return true;
  }

  sendResponse({ received: false });
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === imageTabId) imageTabId = null;
  if (tabId === chatgptTabId) chatgptTabId = null;
  if (tabId === localTabId) localTabId = null;
});
