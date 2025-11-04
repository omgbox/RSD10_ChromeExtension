// Annotation: This script handles background API interactions, including fetching torrent files and extracting subtitles.
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension Installed");
});

// Function to fetch content from a URL
async function fetchContent(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error("Error fetching content:", error);
        return null;
    }
}
// Background script for video streaming extension

let creatingOffscreenDocument; // A global promise to avoid race conditions for offscreen document creation
let castApiReadyPromise;

// A function to resolve the promise once the Cast API is ready.
let resolveCastApiReady;

function initializeCastApiPromise() {
    castApiReadyPromise = new Promise(resolve => {
        resolveCastApiReady = resolve;
    });
}

initializeCastApiPromise();

// Conditionally set up offscreen document for Chromecast if API is available
if (chrome.offscreen && chrome.runtime.getOffscreenDocuments) {
  setupOffscreenDocument('offscreen.html');
} else {
  console.warn('chrome.offscreen API not available. Chromecast functionality may be limited.');
}

// --- Cast API Initialization and Session Management ---

let currentSession = null;

function onInitSuccess() {
  console.log('Cast API initialized successfully in background.');
  if (resolveCastApiReady) {
    resolveCastApiReady(true);
  }
}

function onError(error) {
  console.error('Cast API initialization error in background', error);
  if (resolveCastApiReady) {
    resolveCastApiReady(false); // Resolve with failure
  }
}

function session_listener(session) {
  currentSession = session;
  console.log('New Cast session started:', session.sessionId);
  session.addUpdateListener(sessionUpdateListener);
}

function sessionUpdateListener(isAlive) {
  const message = isAlive ? 'Session Updated' : 'Session Ended';
  console.log(message, currentSession ? currentSession.sessionId : 'N/A');
  if (!isAlive) {
    currentSession = null;
  }
}

function receiver_listener(availability) {
  if (availability === chrome.cast.ReceiverAvailability.AVAILABLE) {
    console.log('Cast receivers available.');
  } else {
    console.log('No Cast receivers available.');
  }
}

async function startCasting(mediaUrl, callback) {
  const isApiReady = await castApiReadyReadyPromise;
  if (!isApiReady) {
      console.error('Cast API initialization failed.');
      callback({ success: false, message: 'Cast API failed to initialize.' });
      return;
  }

  const onSessionRequestSuccess = (session) => {
    currentSession = session;
    session.addUpdateListener(sessionUpdateListener);
    loadMedia(mediaUrl, callback);
  };

  const onRequestSessionError = (error) => {
    console.error('Cast session request error', error);
    callback({ success: false, message: `Could not start Cast session: ${error.message || 'Unknown error'}` });
  };
  
  chrome.cast.requestSession(onSessionRequestSuccess, onRequestSessionError);
}

function loadMedia(mediaUrl, callback) {
  if (!currentSession) {
    callback({ success: false, message: 'No active Cast session.' });
    return;
  }

  const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, 'video/mp4');
  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;

  currentSession.loadMedia(request,
    (media) => {
      console.log('Media loaded successfully:', media.mediaSessionId);
      callback({ success: true, message: 'Casting started!' });
    },
    (error) => {
        console.error('Media load error', error);
        callback({ success: false, message: 'Failed to load media on Chromecast.' });
    }
  );
}

// --- New functionality for magnet link handling and detached player ---
// --- New functionality for magnet link handling and detached player ---
const API_BASE = 'https://rsd.ovh';

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey'], (syncResult) => {
      if (syncResult.apiKey) {
        resolve(syncResult.apiKey);
      } else {
        chrome.storage.local.get(['apiKey'], (localResult) => {
          resolve(localResult.apiKey);
        });
      }
    });
  });
}

async function fetchWithApiKey(url, options = {}) {
  const apiKey = await getApiKey();
  const headers = new Headers(options.headers || {});
  if (apiKey) {
    headers.append('X-API-Key', apiKey);
  }
  options.headers = headers;
  return fetch(url, options);
}

function isVideoFile(fileName) {
  const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.mpeg', '.mpg', '.3gp'];
  const lowerFileName = fileName.toLowerCase();
  return videoExtensions.some(ext => lowerFileName.endsWith(ext));
}

function isSubtitleFile(fileName) {
  const subtitleExtensions = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'];
  const lowerFileName = fileName.toLowerCase();
  return subtitleExtensions.some(ext => lowerFileName.endsWith(ext));
}

function getBaseName(fileName) {
  const lastDotIndex = fileName.lastIndexOf('.');
  // For both video and subtitle files, we want the base name without the final extension.
  // The complex logic for language codes should be in findEnglishSrtFile, not here.
  return lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex);
}

function findEnglishSrtFile(videoFileName, allFiles) {
  const videoBaseName = getBaseName(videoFileName);

  let bestMatch = null;
  let bestMatchScore = -1;

  allFiles.forEach(file => {
    const fileName = file.path || file.Name;
    if (typeof fileName !== 'string') return; // Ensure fileName is a string

    if (isSubtitleFile(fileName)) {
      const subtitleBaseName = getBaseName(fileName);
      if (subtitleBaseName === videoBaseName) {
        let score = 0;
        const lowerFileName = fileName.toLowerCase();

        // Prioritize more specific and common English patterns
        if (/\.eng\.srt$/i.test(lowerFileName)) score += 10; // e.g., .eng.srt
        else if (/\.en\.srt$/i.test(lowerFileName)) score += 9; // e.g., .en.srt
        else if (/english\.srt$/i.test(lowerFileName)) score += 8; // e.g., english.srt
        else if (/eng\.srt$/i.test(lowerFileName)) score += 7; // e.g., eng.srt
        else if (/\benglish\b/i.test(lowerFileName)) score += 6; // word 'english'
        else if (/\beng\b/i.test(lowerFileName)) score += 5; // word 'eng'
        else if (/\b(?:en-us|en-gb)\b/i.test(lowerFileName)) score += 4; // specific locales
        else if (/\bforced\b/i.test(lowerFileName)) score += 3; // forced subtitles
        else if (/\bsdh\b/i.test(lowerFileName)) score += 2; // SDH subtitles
        else if (/\.srt$/i.test(lowerFileName)) score += 1; // General srt fallback

        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = file;
        }
      }
    }
  });
  return bestMatch;
}

// New function to find any SRT with a matching base name
function findMatchingSrtFile(videoFileName, allFiles) {
  const videoBaseName = getBaseName(videoFileName);
  return allFiles.find(file => {
    const fileName = file.path || file.Name;
    if (typeof fileName !== 'string') return false;
    return isSubtitleFile(fileName) && getBaseName(fileName) === videoBaseName;
  });
}

async function fetchTorrentFiles(magnetLink) {
  const apiBase = API_BASE;
  try {
    const filesResponse = await fetchWithApiKey(`${apiBase}/files?url=${encodeURIComponent(magnetLink)}`);
    if (!filesResponse.ok) {
      const errorText = await filesResponse.text();
      throw new Error(`HTTP ${filesResponse.status}: ${errorText}`);
    }
    const filesData = await filesResponse.json();
    if (!filesData.Files || !Array.isArray(filesData.Files) || filesData.Files.length === 0) {
      throw new Error('No files found in torrent response');
    }
    return filesData.Files;
  } catch (error) {
    console.error('Error fetching torrent files:', error);
    throw error;
  }
}

function findLargestVideoFile(files) {
  const videoFiles = files.filter(file => isVideoFile(file.path || file.Name));
  if (videoFiles.length === 0) {
    return null;
  }
  let largestVideoFile = videoFiles[0];
  for (let i = 1; i < videoFiles.length; i++) {
    if (videoFiles[i].size > largestVideoFile.size) {
      largestVideoFile = videoFiles[i];
    }
  }
  return largestVideoFile;
}

async function probeForSubtitles(magnetLink, fileIndex) {
  const apiBase = API_BASE;
  try {
    const probeResponse = await fetchWithApiKey(`${apiBase}/probe?url=${encodeURIComponent(magnetLink)}&index=${fileIndex}`);
    if (!probeResponse.ok) {
        throw new Error(`HTTP ${probeResponse.status}`);
    }
    const probeData = await probeResponse.json();
    return probeData.hasSubtitles;
  } catch (error) {
    console.error('Subtitle probe error:', error);
    return false;
  }
}

async function extractSubtitles(magnetLink, fileIndex, isSRT = false, subIndex = 0, apiKey) {
  const apiBase = API_BASE;
  try {
    let url = `${apiBase}/subtitles/extract?url=${encodeURIComponent(magnetLink)}&fileIndex=${fileIndex}&isSRTFile=${isSRT}`;
    if (!isSRT) {
      url += `&subIndex=${subIndex}`;
    }
    const extractResponse = await fetchWithApiKey(url);
    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      throw new Error(`HTTP ${extractResponse.status}: ${errorText}`);
    }
    const task = await extractResponse.json();
    return task.id;
  } catch (error) {
    console.error('Error starting subtitle extraction:', error);
    throw error;
  }
}

let activePollInterval = null; // To store the interval ID for cancellation
let activeSenderTabId = null; // To store the tab ID of the active request

async function pollSubtitleStatus(taskId, senderTabId, fileName, videoFileType, apiKey) {
  const apiBase = API_BASE;
  // Clear any previous polling interval
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
  activeSenderTabId = senderTabId;

  return new Promise((resolve, reject) => {
    activePollInterval = setInterval(async () => {
      // Only proceed if this is still the active request
      if (senderTabId !== activeSenderTabId) {
        clearInterval(activePollInterval);
        activePollInterval = null;
        resolve(null); // Resolve with null to indicate cancellation/ignored
        return;
      }

      try {
        const statusResponse = await fetchWithApiKey(`${apiBase}/subtitles/status?id=${taskId}`);
        if (!statusResponse.ok) {
          clearInterval(activePollInterval);
          activePollInterval = null;
          chrome.tabs.sendMessage(senderTabId, {
            action: 'subtitleExtractionUpdate',
            status: 'error',
            message: 'Error getting subtitle status.',
            fileName: fileName,
            videoFileType: videoFileType
          });
          reject(new Error('Error getting subtitle status.'));
          return;
        }
        const status = await statusResponse.json();

        if (status.status === 'extracting') {
          const progress = status.progress.toFixed(1);
          chrome.tabs.sendMessage(senderTabId, {
            action: 'subtitleExtractionUpdate',
            status: 'extracting',
            progress: progress,
            message: `Extracting subtitles... ${progress}%`,
            fileName: fileName,
            videoFileType: videoFileType
          });
        } else if (status.status === 'complete') {
          clearInterval(activePollInterval);
          activePollInterval = null;
          chrome.tabs.sendMessage(senderTabId, {
            action: 'subtitleExtractionUpdate',
            status: 'complete',
            progress: 100,
            message: `Subtitles ready!`,
            fileName: fileName,
            videoFileType: videoFileType
          });
          resolve(`${apiBase}/subtitles/download?id=${taskId}&api_key=${apiKey}`);
        } else if (status.status === 'error') {
          clearInterval(activePollInterval);
          activePollInterval = null;
          chrome.tabs.sendMessage(senderTabId, {
            action: 'subtitleExtractionUpdate',
            status: 'error',
            message: `Error extracting subtitles: ${status.error}`,
            fileName: fileName,
            videoFileType: videoFileType
          });
          reject(new Error(`Error extracting subtitles: ${status.error}`));
        }
      } catch (error) {
        clearInterval(activePollInterval);
        activePollInterval = null;
        console.error('Error polling subtitle status:', error);
        chrome.tabs.sendMessage(senderTabId, {
          action: 'subtitleExtractionUpdate',
          status: 'error',
          message: `Error polling subtitle status for ${fileName}.`,
          fileName: fileName,
          videoFileType: videoFileType
        });
        reject(error);
      }
    }, 2000);
  });
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'castApiReady') {
    console.log('Background: Received castApiReady message from offscreen document.');
    // This is the signal from offscreen.html
    const applicationId = 'CC1AD845';
    const sessionRequest = new chrome.cast.SessionRequest(applicationId);
    const apiConfig = new chrome.cast.ApiConfig(
        sessionRequest, session_listener, receiver_listener,
        chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED, chrome.cast.DefaultActionPolicy.CREATE_SESSION
    );
    chrome.cast.initialize(apiConfig, onInitSuccess, onError);
    return false; // No async response needed
  } else if (request.action === 'castMedia' && request.url) {
    // Before attempting to cast, ensure the Cast API is ready.
    // This is especially important if the background script was inactive and just woken up.
    (async () => {
      await castApiReadyPromise;
      startCasting(request.url, sendResponse);
    })();
    return true; // Indicate that sendResponse will be called asynchronously
  } else if (request.action === 'openDetachedPlayer' && request.magnetURI) {
    (async () => {
      let vttUrl = '';
      let largestVideo = null; 
      const apiKey = await getApiKey(); // Get the API key here
      if (!apiKey) {
        sendResponse({ success: false, message: 'API Key not set. Please configure it in the extension options.' });
        return;
      }

      try {
        if (activePollInterval) {
          clearInterval(activePollInterval);
          activePollInterval = null;
        }
        activeSenderTabId = sender.tab.id;

        const files = await fetchTorrentFiles(request.magnetURI);
        largestVideo = findLargestVideoFile(files);

        if (!largestVideo) {
          sendResponse({ success: false, message: 'No video files found in torrent.' });
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'subtitleExtractionUpdate',
            status: 'error',
            message: 'No video files found in torrent.',
            fileName: 'N/A',
            videoFileType: 'unknown'
          });
          return;
        }

        const videoFileName = largestVideo.path || largestVideo.Name;
        const videoFileExtension = videoFileName.split('.').pop().toLowerCase();
        const videoFileType = videoFileExtension;
        const videoFileIndex = largestVideo.originalIndex;
        const videoBaseName = getBaseName(videoFileName);

        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'showPreparingSnackbar',
          fileName: videoFileName
        });

        let selectedSubtitleFile = null;

        if (videoFileType === 'mp4') {
          const exactMatchSrt = findMatchingSrtFile(videoFileName, files);
          if (exactMatchSrt) {
            selectedSubtitleFile = exactMatchSrt;
            chrome.tabs.sendMessage(sender.tab.id, {
              action: 'subtitleExtractionUpdate',
              status: 'starting',
              message: `Found matching subtitle file. Extracting...`,
              fileName: selectedSubtitleFile.path || selectedSubtitleFile.Name,
              videoFileType: videoFileType
            });
            const taskId = await extractSubtitles(request.magnetURI, selectedSubtitleFile.originalIndex, true, 0, apiKey);
            vttUrl = await pollSubtitleStatus(taskId, sender.tab.id, selectedSubtitleFile.path || selectedSubtitleFile.Name, videoFileType, apiKey);
          } else {
            const englishSrtFile = findEnglishSrtFile(videoFileName, files);
            if (englishSrtFile) {
              selectedSubtitleFile = englishSrtFile;
              chrome.tabs.sendMessage(sender.tab.id, {
                action: 'subtitleExtractionUpdate',
                status: 'starting',
                message: `Found English subtitle file. Extracting...`,
                fileName: selectedSubtitleFile.path || selectedSubtitleFile.Name,
                videoFileType: videoFileType
              });
              const taskId = await extractSubtitles(request.magnetURI, selectedSubtitleFile.originalIndex, true, 0, apiKey);
              vttUrl = await pollSubtitleStatus(taskId, sender.tab.id, selectedSubtitleFile.path || selectedSubtitleFile.Name, videoFileType, apiKey);
            } else {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: 'subtitleExtractionUpdate',
                status: 'complete',
                message: `No subtitles found.`, 
                fileName: videoFileName,
                videoFileType: videoFileType
              });
            }
          }
        } else if (videoFileType === 'mkv') {
          const srtFile = files.find(file => isSubtitleFile(file.path || file.Name) && getBaseName(file.path || file.Name) === videoBaseName);

          if (srtFile) {
            const srtFileName = srtFile.path || srtFile.Name;
            chrome.tabs.sendMessage(sender.tab.id, {
              action: 'subtitleExtractionUpdate',
              status: 'starting',
              message: `Found external subtitle file. Extracting...`,
              fileName: srtFileName,
              videoFileType: videoFileType
            });
            const taskId = await extractSubtitles(request.magnetURI, srtFile.originalIndex, true, 0, apiKey);
            vttUrl = await pollSubtitleStatus(taskId, sender.tab.id, srtFileName, videoFileType, apiKey);
          } else {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: 'subtitleExtractionUpdate',
              status: 'starting',
              message: `Probing for embedded subtitles...`,
              fileName: videoFileName,
              videoFileType: videoFileType
            });
            const hasEmbeddedSubtitles = await probeForSubtitles(request.magnetURI, videoFileIndex);
            if (hasEmbeddedSubtitles) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: 'subtitleExtractionUpdate',
                status: 'starting',
                message: `Found embedded subtitles. Extracting...`,
                fileName: videoFileName,
                videoFileType: videoFileType
              });
              const taskId = await extractSubtitles(request.magnetURI, videoFileIndex, false, 0, apiKey);
              vttUrl = await pollSubtitleStatus(taskId, sender.tab.id, videoFileName, videoFileType, apiKey);
            } else {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: 'subtitleExtractionUpdate',
                status: 'complete',
                message: `No subtitles found.`, 
                fileName: videoFileName,
                videoFileType: videoFileType
              });
            }
          }
        } else {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'subtitleExtractionUpdate',
            status: 'complete',
            message: `No subtitle processing for this file type.`, 
            fileName: videoFileName,
            videoFileType: videoFileType
          });
        }

        if (sender.tab.id !== activeSenderTabId) {
          sendResponse({ success: false, message: 'Request cancelled by a newer request.' });
          return;
        }

        // Construct the URL for the detached video player
        const apiBase = API_BASE;
        const streamUrl = `${apiBase}/stream?url=${encodeURIComponent(request.magnetURI)}&index=${videoFileIndex}&api_key=${apiKey}`;
        // The videoFilename is passed as a URL parameter to be displayed in the detached player's window title.
        let detachedUrl = chrome.runtime.getURL(`detached_player.html?streamUrl=${encodeURIComponent(streamUrl)}&apiBase=${encodeURIComponent(apiBase)}&videoFilename=${encodeURIComponent(videoFileName)}`);
        if (vttUrl) {
          detachedUrl += `&vttUrl=${encodeURIComponent(vttUrl)}`;
        }

        // Create a new popup window for the detached player
        chrome.windows.create({
          url: detachedUrl,
          type: 'popup',
          width: 800,
          height: 600
        }, (newWindow) => {
          if (newWindow) {
            sendResponse({ success: true });
          }
          else {
            sendResponse({ success: false, message: 'Failed to create detached player window.' });
          }
        });
      } catch (error) {
        console.error('Error in openDetachedPlayer:', error);
        if (sender.tab.id === activeSenderTabId) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'subtitleExtractionUpdate',
            status: 'error',
            message: `Error: ${error.message}`,
            fileName: largestVideo ? (largestVideo.path || largestVideo.Name) : 'Unknown File',
            videoFileType: largestVideo ? (largestVideo.Name.split('.').pop().toLowerCase()) : 'unknown'
          });
        }
        sendResponse({ success: false, message: error.message });
      }
    })();
    return true;
  }
});
