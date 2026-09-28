chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sah-weather-lookup",
    title: 'Get weather for "%s"',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "sah-weather-lookup") return;
  if (!info.selectionText || !tab || !tab.id) return;

  chrome.tabs.sendMessage(
    tab.id,
    { type: "SAH_WEATHER_LOOKUP", text: info.selectionText },
    { frameId: info.frameId }
  );
});
