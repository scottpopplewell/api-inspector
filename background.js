(function () {
  const tabStorage = {};
  const tabKeyPrefix = "TAB-";
  const networkFilters = {
    urls: ["<all_urls>"],
  };

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const { tabId, requestId } = details;
      if (!tabStorage.hasOwnProperty(tabId)) {
        return;
      }

      if (tabStorage[tabId]) {
        tabStorage[tabId].requests[requestId] = {
          requestId: requestId,
          method: details.method,
          url: details.url,
          startTime: details.timeStamp,
          status: "Pending",
          requestBody:
            details.method == "POST" ? getRequestBody(details) : null,
          formData: details.method == "POST" ? getFormData(details) : null
        };
      } else {
        tabStorage[tabId] = {
          id: tabId,
          requests: {},
          registerTime: new Date().getTime(),
        };

        tabStorage[tabId].requests[requestId] = {
          requestId: requestId,
          method: details.method,
          url: details.url,
          startTime: details.timeStamp,
          status: "Pending",
          requestBody:
            details.method == "POST" ? getRequestBody(details) : null,
          formData: details.method == "POST" ? getFormData(details) : null
        };
      }
      const restRequestKey = tabKeyPrefix + tabId;
      const data = tabStorage[tabId].requests;
      setStorageData(restRequestKey, data);
    },
    networkFilters,
    ["blocking", "requestBody"]
  );

  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const { tabId, requestId } = details;
      const clientCorrelationId = getHeaderValue(details, "client-correlation-id");
      const debugQAUrl = getQAUrl(clientCorrelationId);
      const debugProdUrl = getProdUrl(clientCorrelationId);

      tabStorage[tabId].requests[requestId] = { ...tabStorage[tabId].requests[requestId],
        debugQAUrl: debugQAUrl,
        debugProdUrl: debugProdUrl
      }
    },
    networkFilters,
    ["blocking", "requestHeaders"]
  );

  chrome.webRequest.onCompleted.addListener((details) => {
    const { tabId, requestId } = details;
    if (!tabStorage.hasOwnProperty(tabId)) {
      return;
    }

    if (!tabStorage[tabId]) {
      return;
    }

    if (
      tabStorage[tabId] &&
      !tabStorage[tabId].requests.hasOwnProperty(requestId)
    ) {
      return;
    }

    const request = tabStorage[tabId].requests[requestId];

    Object.assign(request, {
      endTime: details.timeStamp,
      requestDuration: details.timeStamp - request.startTime,
      status: "Complete",
    });
    const restRequestKey = tabKeyPrefix + tabId;
    const data = tabStorage[tabId].requests;
    setStorageData(restRequestKey, data);
  }, networkFilters);

  chrome.webRequest.onErrorOccurred.addListener((details) => {
    const { tabId, requestId } = details;
    if (!tabStorage.hasOwnProperty(tabId)) {
      return;
    }

    if (!tabStorage[tabId]) {
      return;
    }

    if (
      tabStorage[tabId] &&
      !tabStorage[tabId].requests.hasOwnProperty(requestId)
    ) {
      return;
    }

    const request = tabStorage[tabId].requests[requestId];
    Object.assign(request, {
      endTime: details.timeStamp,
      requestDuration: details.timeStamp - request.startTime,
      status: "Error",
    });
    const restRequestKey = tabKeyPrefix + tabId;
    const data = tabStorage[tabId].requests;
    setStorageData(restRequestKey, data);
  }, networkFilters);

  chrome.tabs.onActivated.addListener((tab) => {
    const tabId = tab ? tab.tabId : chrome.tabs.TAB_ID_NONE;
    if (!tabStorage.hasOwnProperty(tabId)) {
      console.log("onActivated tabID :::::", tabId);
      tabStorage[tabId] = {
        id: tabId,
        requests: {},
        registerTime: new Date().getTime(),
      };
    }
  });
  chrome.tabs.onRemoved.addListener((tab) => {
    const tabId = tab;
    if (!tabStorage.hasOwnProperty(tabId)) {
      return;
    }
    console.log("removed tabID :::::", tabId);
    tabStorage[tabId] = null;
    const restRequestKey = tabKeyPrefix + tabId;
    clearStorageData(restRequestKey);
  });
})();

const setStorageData = (key, data) =>
  chrome.storage.local.set({ [key]: data }, function () {
    var error = chrome.runtime.lastError;
    if (error) {
      console.log("ERROR:::", error);
    } else {
      //console.log("Saved", key, data);
    }
  });

const clearStorageData = (key) =>
  chrome.storage.local.remove([key], function () {
    var error = chrome.runtime.lastError;
    if (error) {
      console.log("ERROR:::", error);
    }
  });

function getRequestBody(details) {
  if (details && details.requestBody && details.requestBody.raw) {
    try {
      return decodeURIComponent(
        String.fromCharCode.apply(
          null,
          new Uint8Array(details.requestBody.raw[0].bytes)
        )
      );
    } catch (error) {
      console.info(error);
    }
  }
}

function getFormData(details) {
  if (details && details.requestBody && details.requestBody.formData) {
    return JSON.stringify(details.requestBody.formData);
  }
}


function getHeaderValue(details, headerName) {
  for (var i = 0; i < details.requestHeaders.length; ++i) {
    if (details.requestHeaders[i].name === headerName) {
      return details.requestHeaders[i].value
    }
  }
}

function getQAUrl(clientCorrelationId) {
   return "https://splunkqa.com/?q=blahblah"
}

function getProdUrl(clientCorrelationId) {
  return "https://splunprod.com/?q=blahblah"
}
