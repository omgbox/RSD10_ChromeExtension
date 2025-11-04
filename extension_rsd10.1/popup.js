// Annotation: This script controls the extension's popup UI, managing torrent loading, file selection, subtitle extraction, detached player initiation, and API key configuration.
document.addEventListener('DOMContentLoaded', function() {
  const magnetInput = document.getElementById('magnetInput');
  const loadBtn = document.getElementById('loadBtn');
  const newStreamBtn = document.getElementById('newStreamBtn');
  const statusDiv = document.getElementById('status');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const fileListContainer = document.getElementById('fileListContainer');
  const fileList = document.getElementById('fileList');
  const subtitleProgressContainer = document.getElementById('subtitleProgressContainer');
  const subtitleProgressFill = document.getElementById('subtitleProgressFill');
  const subtitleProgressText = document.getElementById('subtitleProgressText');
  const apiStatusIndicator = document.getElementById('apiStatusIndicator');
  const apiKeyStatusDiv = document.getElementById('apiKeyStatus');
  const viewContainer = document.getElementById('viewContainer');
  const settingsBtn = document.getElementById('settingsBtn');
  const backBtn = document.getElementById('backBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const settingsStatusMessage = document.getElementById('settingsStatusMessage');
  
  let currentMagnet = '';
  let selectedVideoFileIndex = -1;
  let selectedSrtFileIndex = -1;
  let selectedFileName = '';
  let currentVttUrl = '';
  let allFiles = [];
  let isTorrentLoaded = false;
  let isExtracting = false; // Lock to prevent concurrent extractions
  let userApiKey = '';

  const API_BASE = 'https://rsd.ovh';
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  function getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('apiKey', (data) => {
        if (data.apiKey) {
          userApiKey = data.apiKey;
          resolve(userApiKey);
        } else {
          chrome.storage.local.get('apiKey', (localData) => {
            if (localData.apiKey) {
              userApiKey = localData.apiKey;
            }
            resolve(userApiKey);
          });
        }
      });
    });
  }

  async function fetchWithAuth(url, options = {}) {
    if (!userApiKey) {
      updateStatus('API Key not found. Please set it in the settings.', true);
      apiKeyStatusDiv.innerHTML = 'API Key not set. <a href="#" id="openSettingsLink">Set it here</a>.';
      document.getElementById('openSettingsLink').addEventListener('click', () => viewContainer.classList.add('show-settings'));
      return Promise.reject(new Error('API Key not found.'));
    }
    const headers = { ...options.headers, 'X-API-Key': userApiKey };
    return fetch(url, { ...options, headers });
  }

  async function checkApiAndKeyStatus() {
    try {
      const response = await fetch(API_BASE);
      if (response.ok) {
        setApiStatus('online');
      } else {
        setApiStatus('offline');
        apiKeyStatusDiv.textContent = 'Server is offline.';
        return;
      }
    } catch (error) {
      setApiStatus('offline');
      apiKeyStatusDiv.textContent = 'Server is unreachable.';
      return;
    }

    if (!userApiKey) {
      if (!viewContainer.classList.contains('show-settings')) {
        apiKeyStatusDiv.innerHTML = 'API Key not set. <a href="#" id="openSettingsLink">Click here to set it.</a>';
        document.getElementById('openSettingsLink').addEventListener('click', (e) => { e.preventDefault(); viewContainer.classList.add('show-settings'); });
      }
      return;
    }

    try {
      const response = await fetchWithAuth(API_BASE + '/user/api-key-status');
      const data = await response.json();

      if (!response.ok) {
        apiKeyStatusDiv.textContent = `⚠️ ${data.error || 'Invalid or Expired API Key'}`;
        apiKeyStatusDiv.style.color = '#e74c3c';
      } else {
        if (data.isMasterKey) {
          apiKeyStatusDiv.textContent = 'Master key is active (does not expire).';
          apiKeyStatusDiv.style.color = '#2ecc71';
        } else {
          const expires = new Date(data.expiresAt);
          const now = new Date();
          const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));

          if (daysLeft > 0) {
            apiKeyStatusDiv.textContent = `Key expires in ${daysLeft} day(s).`;
            apiKeyStatusDiv.style.color = daysLeft < 7 ? '#f1c40f' : '#2ecc71';
          } else {
            apiKeyStatusDiv.textContent = 'Key has expired.';
            apiKeyStatusDiv.style.color = '#e74c3c';
          }
        }
      }
    } catch (error) {
      console.error('Error fetching API key status:', error);
      apiKeyStatusDiv.textContent = 'Could not verify API key status.';
    }
  }

  function setApiStatus(status) {
    apiStatusIndicator.className = status;
    switch (status) {
      case 'online':
        apiStatusIndicator.title = 'API is online';
        break;
      case 'offline':
        apiStatusIndicator.title = 'API is offline';
        break;
      default:
        apiStatusIndicator.title = 'Checking API status...';
        break;
    }
  }
  
  function saveVideoState() {
    if (currentMagnet && selectedVideoFileIndex !== -1 && selectedFileName) {
      chrome.storage.local.set({
        lastMagnet: currentMagnet,
        lastVideoFileIndex: selectedVideoFileIndex,
        lastSrtFileIndex: selectedSrtFileIndex,
        lastFileName: selectedFileName,
        lastVttUrl: currentVttUrl
      });
    }
  }

  function clearVideoState() {
    chrome.storage.local.remove(['lastMagnet', 'lastVideoFileIndex', 'lastSrtFileIndex', 'lastFileName', 'lastVttUrl']);
  }
  
  let currentFlashingInterval = null;

  function updateStatus(message, isError = false, flashing = false) {
    if (currentFlashingInterval) {
      clearInterval(currentFlashingInterval);
      currentFlashingInterval = null;
    }
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    if (flashing) {
      let visible = true;
      currentFlashingInterval = setInterval(() => {
        statusDiv.style.opacity = visible ? '1' : '0';
        visible = !visible;
      }, 500);
    } else {
      statusDiv.style.opacity = '1';
    }
    statusDiv.className = isError ? 'error' : '';
  }
  
  function showProgress() {
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    updateStatus('Waiting for download to start...');
  }
  
  function hideProgress() {
    progressContainer.style.display = 'none';
  }
  
  function showFileList() {
    fileListContainer.style.display = 'block';
  }
  
  function hideFileList() {
    fileListContainer.style.display = 'none';
  }
  
  async function loadTorrent() {
    const magnetLink = magnetInput.value.trim();
    if (!magnetLink) {
      updateStatus('Please enter a magnet link', true);
      return;
    }
    
    isTorrentLoaded = false;
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    currentMagnet = magnetLink;
    updateStatus('Loading torrent...');
    showProgress();
    
    try {
      const cachedData = await getCachedTorrentData(magnetLink);
      if (cachedData) {
        updateStatus(`Found ${cachedData.metadata.fileCount} files in "${cachedData.metadata.name}" (cached)`);
        allFiles = cachedData.files.Files;
        displayFileList(allFiles);
        showFileList();
        probeAllMKVFiles();
        handleAutoSelection();
        return;
      }

      const metadataResponse = await fetchWithAuth(`${API_BASE}/metadata?url=${encodeURIComponent(magnetLink)}`);
      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        throw new Error(`HTTP ${metadataResponse.status}: ${errorText}`);
      }
      
      const metadata = await metadataResponse.json();
      updateStatus(`Found ${metadata.fileCount} files in "${metadata.name}"`);
      
      const filesResponse = await fetchWithAuth(`${API_BASE}/files?url=${encodeURIComponent(magnetLink)}`);
      if (!filesResponse.ok) {
        const errorText = await filesResponse.text();
        throw new Error(`HTTP ${filesResponse.status}: ${errorText}`);
      }
      
      const filesData = await filesResponse.json();
      
      if (!filesData.Files || !Array.isArray(filesData.Files) || filesData.Files.length === 0) {
        updateStatus('No files found in torrent response.', true);
        throw new Error('No files found in torrent response');
      }
      
      await cacheTorrentData(magnetLink, metadata, filesData);
      allFiles = filesData.Files;
      displayFileList(allFiles);
      showFileList();
      probeAllMKVFiles();
      handleAutoSelection();
      
    } catch (error) {
      console.error('Load torrent error:', error);
      updateStatus(`Error: ${error.message}`, true);
      hideProgress();
      isTorrentLoaded = false;
      loadBtn.textContent = 'Load Torrent';
      loadBtn.disabled = false;
    }
  }

  function handleAutoSelection() {
    const videoFiles = allFiles.filter(file => isVideoFile(file.path || file.Name));
    if (videoFiles.length > 0) {
      let largestVideoFile = videoFiles[0];
      for (let i = 1; i < videoFiles.length; i++) {
        if (videoFiles[i].size > largestVideoFile.size) {
          largestVideoFile = videoFiles[i];
        }
      }
      selectedVideoFileIndex = largestVideoFile.originalIndex;
      selectedFileName = largestVideoFile.path || largestVideoFile.Name || `File ${largestVideoFile.originalIndex + 1}`;
      
      const fileItems = fileList.querySelectorAll('.file-item');
      fileItems.forEach(item => {
        if (parseInt(item.dataset.originalIndex) === selectedVideoFileIndex) {
          item.classList.add('selected-video');
        }
      });

      isTorrentLoaded = true;
      loadBtn.textContent = 'Play in Detached Player';
      saveVideoState();
      updateLoadBtnState();

      const autoSelectedSrtIndex = findEnglishSrtFile(selectedFileName);
      if (autoSelectedSrtIndex !== -1) {
        selectedSrtFileIndex = autoSelectedSrtIndex;
        fileItems.forEach(item => {
          if (parseInt(item.dataset.originalIndex) === selectedSrtFileIndex) {
            item.classList.add('selected-srt');
          }
        });
        updateStatus(`Auto-selected largest video and English subtitle. Extracting subtitles...`, false, true);
        isExtracting = true;
        extractSubtitles(true);
      } else if (largestVideoFile.Name && largestVideoFile.Name.toLowerCase().endsWith('.mkv')) {
        updateStatus(`Auto-selected largest video. No matching English SRT found. Checking for embedded subtitles.`, false, true);
        isExtracting = true;
        probeForSubtitles(selectedVideoFileIndex);
      } else {
        updateStatus(`Auto-selected largest video. No matching English subtitles found. Please select a file to play.`, true);
        loadBtn.disabled = false;
      }

    } else {
      updateStatus('No video files found in torrent. Please select a file manually if available.', true);
      loadBtn.textContent = 'Load Torrent';
      loadBtn.disabled = false;
    }
  }

  async function getCachedTorrentData(magnetLink) {
    return new Promise(resolve => {
      const cacheKey = `torrent_${magnetLink}`;
      chrome.storage.local.get(cacheKey, (result) => {
        if (result[cacheKey] && (Date.now() - result[cacheKey].timestamp < CACHE_DURATION)) {
          resolve(result[cacheKey].data);
        } else {
          resolve(null);
        }
      });
    });
  }

  async function cacheTorrentData(magnetLink, metadata, files) {
    return new Promise(resolve => {
      const cacheKey = `torrent_${magnetLink}`;
      const cacheData = {
        timestamp: Date.now(),
        data: { metadata, files }
      };
      chrome.storage.local.set({ [cacheKey]: cacheData }, () => {
        resolve();
      });
    });
  }
  
  function isVideoFile(fileName) {
    if (typeof fileName !== 'string') return false;
    const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.mpeg', '.mpg', '.3gp'];
    const lowerFileName = fileName.toLowerCase();
    return videoExtensions.some(ext => lowerFileName.endsWith(ext));
  }

  function isSubtitleFile(fileName) {
    if (typeof fileName !== 'string') return false;
    const subtitleExtensions = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'];
    const lowerFileName = fileName.toLowerCase();
    return subtitleExtensions.some(ext => lowerFileName.endsWith(ext));
  }

  function getBaseName(fileName) {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (isSubtitleFile(fileName)) {
      let base = fileName.substring(0, lastDotIndex);
      const secondLastDotIndex = base.lastIndexOf('.');
      if (secondLastDotIndex !== -1 && base.length - secondLastDotIndex <= 4) {
        base = base.substring(0, secondLastDotIndex);
      }
      return base;
    }
    return lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex);
  }

  function findEnglishSrtFile(videoFileName) {
    const videoBaseName = getBaseName(videoFileName);
    const englishSubtitlePatterns = [
      /\.eng\.srt$/i, /\.en\.srt$/i, // Specific English SRT extensions
      /english\.srt$/i, /eng\.srt$/i, // Common English keywords before .srt
      /english/i, /eng/i // General keywords in filename
    ];

    let bestMatch = null;
    let bestMatchScore = -1;

    allFiles.forEach(file => {
      const fileName = file.path || file.Name;
      if (isSubtitleFile(fileName)) {
        const subtitleBaseName = getBaseName(fileName);
        if (subtitleBaseName === videoBaseName) {
          let score = 0;
          if (typeof fileName !== 'string') return;
          const lowerFileName = fileName.toLowerCase();

          if (/\.eng\.srt$/i.test(lowerFileName)) score += 5;
          else if (/\.en\.srt$/i.test(lowerFileName)) score += 4;
          else if (/english/i.test(lowerFileName)) score += 3;
          else if (/eng/i.test(lowerFileName)) score += 2;
          else if (/\.srt$/i.test(lowerFileName)) score += 1;

          if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatch = file;
          }
        }
      }
    });
    return bestMatch ? bestMatch.originalIndex : -1;
  }

  function displayFileList(files) {
    fileList.innerHTML = '';
    selectedVideoFileIndex = -1;
    selectedSrtFileIndex = -1;
    currentVttUrl = '';

    const displayableFiles = files.filter(file => {
      const fileName = file.path || file.Name;
      if (!fileName) return false;
      return isVideoFile(fileName) || isSubtitleFile(fileName);
    });
    
    if (!displayableFiles || displayableFiles.length === 0) {
      fileList.innerHTML = '<div class="file-item">No video or subtitle files found</div>';
      return;
    }
    
    displayableFiles.forEach((file) => {
      const fileName = file.path || file.Name || `File ${file.originalIndex + 1}`;
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      if (isVideoFile(fileName)) {
        fileItem.classList.add('video-file-item');
      } else if (isSubtitleFile(fileName)) {
        fileItem.classList.add('srt-file-item');
      }
      const fileSize = file.size_human || file.SizeHuman || '';
      
      let displayText = fileName;
      if (isSubtitleFile(fileName)) {
        displayText += ' (Subtitle File)';
      }
      displayText += ` (${fileSize})`;

      fileItem.textContent = displayText;
      fileItem.dataset.originalIndex = file.originalIndex;
      fileItem.dataset.isSrt = isSubtitleFile(fileName);
      fileItem.addEventListener('click', () => selectFile(file.originalIndex, fileItem, fileName, isSubtitleFile(fileName)));
      fileList.appendChild(fileItem);
    });
  }
  
  function selectFile(originalIndex, element, fileName, isSubtitle) {
    if (isExtracting) {
      updateStatus('⚠️ Please wait for the current subtitle extraction to finish.', true);
      return;
    }

    if (isSubtitle) {
      const previouslySelectedSrt = fileList.querySelector('.file-item.selected-srt');
      if (previouslySelectedSrt) {
        previouslySelectedSrt.classList.remove('selected-srt');
      }
      element.classList.add('selected-srt');
      selectedSrtFileIndex = originalIndex;
      updateStatus(`Selected subtitle: ${fileName}`);
      currentVttUrl = '';

      const videoBaseName = getBaseName(fileName);
      const matchingVideo = allFiles.find(file => isVideoFile(file.path || file.Name) && getBaseName(file.path || file.Name) === videoBaseName);
      if (matchingVideo) {
          selectedVideoFileIndex = matchingVideo.originalIndex;
          selectedFileName = matchingVideo.path || matchingVideo.Name;
          const fileItems = fileList.querySelectorAll('.file-item');
          const previouslySelectedVideo = fileList.querySelector('.file-item.selected-video');
          if (previouslySelectedVideo) {
              previouslySelectedVideo.classList.remove('selected-video');
          }
          fileItems.forEach(item => {
              if (parseInt(item.dataset.originalIndex) === selectedVideoFileIndex) {
                item.classList.add('selected-video');
              }
          });
          updateStatus(`Selected subtitle and matching video: ${selectedFileName}`);
      }
      
      isExtracting = true;
      extractSubtitles(true);
    } else {
      const previouslySelectedVideo = fileList.querySelector('.file-item.selected-video');
      if (previouslySelectedVideo) {
        previouslySelectedVideo.classList.remove('selected-video');
      }
      element.classList.add('selected-video');
      selectedVideoFileIndex = originalIndex;
      selectedFileName = fileName;
      updateStatus(`Selected "${fileName}".`);
      
      const srtFile = allFiles.find(file => isSubtitleFile(file.path || file.Name) && getBaseName(file.path || file.Name) === getBaseName(fileName));
      if (srtFile) {
        selectedSrtFileIndex = srtFile.originalIndex;
        const fileItems = fileList.querySelectorAll('.file-item');
        const previouslySelectedSrt = fileList.querySelector('.file-item.selected-srt');
        if (previouslySelectedSrt) {
            previouslySelectedSrt.classList.remove('selected-srt');
        }
        fileItems.forEach(item => {
            if (parseInt(item.dataset.originalIndex) === selectedSrtFileIndex) {
              item.classList.add('selected-srt');
            }
        });
        isExtracting = true;
        extractSubtitles(true);
      } else {
        selectedSrtFileIndex = -1;
        isExtracting = true;
        probeForSubtitles(originalIndex);
      }
    }
    saveVideoState();
    updateLoadBtnState();
  }

  async function probeForSubtitles(fileIndex) {
    updateStatus('🕵️‍♀️ Checking for embedded subtitles...', false, true);
    loadBtn.disabled = true;

    try {
        const probeResponse = await fetchWithAuth(`${API_BASE}/probe?url=${encodeURIComponent(currentMagnet)}&index=${fileIndex}`);
        if (!probeResponse.ok) {
            throw new Error(`HTTP ${probeResponse.status}`);
        }
        const probeData = await probeResponse.json();

        if (probeData.hasSubtitles) {
            updateStatus(`Found ${probeData.subtitleTracks} embedded subtitle track(s). Extracting...`);
            extractSubtitles(false, 0);
        } else {
            updateStatus('No embedded subtitles found.', false);
            isExtracting = false;
            updateLoadBtnState();
        }

    } catch (error) {
        console.error('Subtitle probe error:', error);
        updateStatus('⚠️ Could not check for subtitles.', true);
        isExtracting = false;
        updateLoadBtnState();
    }
  }

  function updateLoadBtnState() {
    const extractionInProgress = isExtracting;

    if (!isTorrentLoaded || selectedVideoFileIndex === -1 || extractionInProgress) {
      loadBtn.disabled = true;
      return;
    }

    if (selectedSrtFileIndex !== -1 && !currentVttUrl) {
      loadBtn.disabled = true;
      return;
    }

    loadBtn.disabled = false;
  }
  
  loadBtn.addEventListener('click', () => {
    const magnetInInput = magnetInput.value.trim();

    if (magnetInInput && magnetInInput !== currentMagnet) {
      loadTorrent();
      return;
    }

    if (isTorrentLoaded) {
      streamDetached();
    } else {
      loadTorrent();
    }
  });

  newStreamBtn.addEventListener('click', () => {
    hideFileList();
    hideProgress();
    updateStatus('Ready');
    magnetInput.value = '';
    selectedVideoFileIndex = -1;
    selectedSrtFileIndex = -1;
    selectedFileName = '';
    currentVttUrl = '';
    isTorrentLoaded = false;
    isExtracting = false;
    loadBtn.textContent = 'Load Torrent';
    loadBtn.disabled = false;
    clearVideoState();
    chrome.storage.local.remove('lastSubtitleTaskId');
  });
  
  async function streamDetached() {
    if (selectedVideoFileIndex === -1 || !currentMagnet) {
      updateStatus('Please select a video file to stream', true);
      return;
    }
    updateStatus('Opening detached player...');
    try {
      const streamUrl = `${API_BASE}/stream?url=${encodeURIComponent(currentMagnet)}&index=${selectedVideoFileIndex}&api_key=${userApiKey}`;
      let detachedUrl = chrome.runtime.getURL(`detached_player.html?streamUrl=${encodeURIComponent(streamUrl)}&apiBase=${encodeURIComponent(API_BASE)}&videoFilename=${encodeURIComponent(selectedFileName)}`);
      if (currentVttUrl) {
        detachedUrl += `&vttUrl=${encodeURIComponent(currentVttUrl)}&api_key=${userApiKey}`;
      }
      chrome.windows.create({
        url: detachedUrl,
        type: 'popup',
        width: 800,
        height: 600
      });
      saveVideoState();
      monitorProgress();
    } catch (error) {
      console.error('Detach error:', error);
      updateStatus(`Detach error: ${error.message}`, true);
    }
  }
  
  async function extractSubtitles(isSRT = false, subIndex = 0) {
    let fileIndexToExtract = -1;
    let isSRTFileFlag = false;

    if (isSRT) {
      fileIndexToExtract = selectedSrtFileIndex;
      isSRTFileFlag = true;
    } else {
      fileIndexToExtract = selectedVideoFileIndex;
    }

    if (fileIndexToExtract === -1 || !currentMagnet) {
      isExtracting = false;
      return;
    }

    subtitleProgressContainer.style.display = 'block';
    subtitleProgressFill.style.width = '0%';
    subtitleProgressText.textContent = '0%';
    updateStatus('🔍 Starting subtitle extraction...', false, true);
    updateLoadBtnState();

    currentVttUrl = '';

    try {
      let url = `${API_BASE}/subtitles/extract?url=${encodeURIComponent(currentMagnet)}&fileIndex=${fileIndexToExtract}&isSRTFile=${isSRTFileFlag}`;
      if (!isSRT) {
        url += `&subIndex=${subIndex}`;
      }
      const extractResponse = await fetchWithAuth(url);
      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        throw new Error(`HTTP ${extractResponse.status}: ${errorText}`);
      }
      const task = await extractResponse.json();

      chrome.storage.local.set({ lastSubtitleTaskId: task.id }, () => {
        pollSubtitleStatus(task.id);
      });

    } catch (error) {
      console.error('Subtitle extraction error:', error);
      updateStatus(`⚠️ Error starting subtitle extraction: ${error.message}`, true);
      subtitleProgressContainer.style.display = 'none';
      isExtracting = false;
      updateLoadBtnState();
    }
  }

  function pollSubtitleStatus(taskId) {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetchWithAuth(`${API_BASE}/subtitles/status?id=${taskId}`);
        if (!statusResponse.ok) {
          clearInterval(pollInterval);
          updateStatus('⚠️ Error getting subtitle status.', true);
          subtitleProgressContainer.style.display = 'none';
          isExtracting = false;
          updateLoadBtnState();
          chrome.storage.local.remove('lastSubtitleTaskId');
          return;
        }
        const status = await statusResponse.json();

        if (status.status === 'extracting') {
          const progress = status.progress.toFixed(1);
          subtitleProgressFill.style.width = `${progress}%`;
          subtitleProgressText.textContent = `${progress}%`;
          updateStatus(`Extracting subtitles... ${progress}%`, false, true);
          subtitleProgressContainer.style.display = 'block';
        } else if (status.status === 'complete') {
          clearInterval(pollInterval);
          subtitleProgressFill.style.width = '100%';
          subtitleProgressText.textContent = '100%';
          updateStatus('✅ Subtitles ready! Opening player...', false);
          subtitleProgressContainer.style.display = 'none';

          currentVttUrl = `${API_BASE}/subtitles/download?id=${taskId}&api_key=${userApiKey}`;
          saveVideoState();
          isExtracting = false;
          updateLoadBtnState();
          chrome.storage.local.remove('lastSubtitleTaskId');
          streamDetached();
        } else if (status.status === 'error') {
          clearInterval(pollInterval);
          updateStatus(`⚠️ Error extracting subtitles: ${status.error}`, true);
          subtitleProgressContainer.style.display = 'none';
          isExtracting = false;
          updateLoadBtnState();
          chrome.storage.local.remove('lastSubtitleTaskId');
        }
      } catch (error) {
        clearInterval(pollInterval);
        console.error('Error polling subtitle status:', error);
        updateStatus('⚠️ Error polling subtitle status.', true);
        subtitleProgressContainer.style.display = 'none';
        isExtracting = false;
        updateLoadBtnState();
        chrome.storage.local.remove('lastSubtitleTaskId');
      }
    }, 2000);
  }
  
  function probeAllMKVFiles() {
    const mkvFiles = allFiles.filter(file => (file.path || file.Name).toLowerCase().endsWith('.mkv'));
    if (mkvFiles.length === 0) return;

    updateStatus(`Probing ${mkvFiles.length} MKV file(s) for subtitles...`);

    const probePromises = mkvFiles.map(file => {
        return fetchWithAuth(`${API_BASE}/probe?url=${encodeURIComponent(currentMagnet)}&index=${file.originalIndex}`)
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                return null;
            })
            .then(probeData => {
                if (probeData && probeData.hasSubtitles) {
                    const fileItem = fileList.querySelector(`.file-item[data-original-index='${file.originalIndex}']`);
                    if (fileItem) {
                        const subIndicator = document.createElement('span');
                        subIndicator.className = 'subtitle-indicator';
                        subIndicator.textContent = ' (Subtitles)';
                        fileItem.appendChild(subIndicator);
                    }
                }
            })
            .catch(err => console.error(`Probe failed for file index ${file.originalIndex}:`, err));
    });

    Promise.all(probePromises).then(() => {
        if (isTorrentLoaded) {
            updateStatus(`Auto-selected largest file. Select a file to play.`);
        }
    });
  }

  async function monitorProgress() {
    if (!currentMagnet) return;
    
    try {
      const statusResponse = await fetchWithAuth(`${API_BASE}/status?url=${encodeURIComponent(currentMagnet)}&index=${selectedVideoFileIndex}`);
      if (!statusResponse.ok) {
        console.log('Status request failed, retrying...');
        setTimeout(() => monitorProgress(), 5000);
        return;
      }
      
      const status = await statusResponse.json();
      
      if (status.percentageCompleted >= 0) {
        progressFill.style.width = `${status.percentageCompleted}%`;
        progressText.textContent = `${status.percentageCompleted.toFixed(1)}%`;

        if (status.percentageCompleted >= 100) {
          updateStatus('✅ Stream ready!');
          hideProgress(); 
          return;
        } else if (status.downloadSpeedBps > 0) {
          updateStatus(`⬇️ Downloading: ${status.percentageCompleted.toFixed(1)}% at ${status.downloadSpeedHuman}`);
        } else {
          updateStatus(`⏳ Waiting for peers: ${status.percentageCompleted.toFixed(1)}%`);
        }
      }
    } catch (error) {
      console.error('Progress monitoring error:', error);
      updateStatus('Connection error, retrying...', true);
    }
    
    if (progressFill.style.width !== '100%') {
      setTimeout(() => monitorProgress(), 3000);
    }
  }
  
  magnetInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      loadTorrent();
    }
  });

  function resumeTorrent(data) {
    currentMagnet = data.lastMagnet;
    selectedVideoFileIndex = data.lastVideoFileIndex;
    selectedSrtFileIndex = data.lastSrtFileIndex;
    selectedFileName = data.lastFileName;
    magnetInput.value = currentMagnet;
    currentVttUrl = data.lastVttUrl || '';
    isTorrentLoaded = true;
    loadBtn.textContent = 'Play in Detached Player';

    fetchWithAuth(`${API_BASE}/files?url=${encodeURIComponent(currentMagnet)}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch files for resumed torrent');
            return response.json();
        })
        .then(filesData => {
            if (!filesData.Files || filesData.Files.length === 0) {
                throw new Error('No files found in torrent response');
            }
            allFiles = filesData.Files;
            displayFileList(allFiles);
            showFileList();

            const fileItems = fileList.querySelectorAll('.file-item');
            fileItems.forEach(item => {
                const index = parseInt(item.dataset.originalIndex);
                if (index === selectedVideoFileIndex) {
                    item.classList.add('selected-video');
                }
                if (index === selectedSrtFileIndex) {
                    item.classList.add('selected-srt');
                }
            });
            probeAllMKVFiles();
        })
        .catch(err => {
            console.error("Failed to resume and fetch file list:", err);
            updateStatus('⚠️ Failed to resume previous session.', true);
            clearVideoState();
        });

    if (data.lastSubtitleTaskId) {
        updateStatus('Resuming subtitle extraction...');
        isExtracting = true;
        pollSubtitleStatus(data.lastSubtitleTaskId);
    } else if (currentVttUrl) {
        updateStatus('✅ Subtitles ready! Click to play.', false);
    } else {
        updateStatus(`Resuming: "${selectedFileName}". Click to play.`);
    }
    updateLoadBtnState();
  }

  // --- Settings View Logic ---
  settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = userApiKey;
    viewContainer.classList.add('show-settings');
  });

  backBtn.addEventListener('click', () => {
    viewContainer.classList.remove('show-settings');
  });

  saveApiKeyBtn.addEventListener('click', async () => {
    const newApiKey = apiKeyInput.value.trim();
    if (!newApiKey) {
      settingsStatusMessage.textContent = 'API Key cannot be empty.';
      settingsStatusMessage.className = 'status-message status-error show';
      return;
    }

    saveApiKeyBtn.disabled = true;
    saveApiKeyBtn.textContent = 'Saving...';

    try {
      await new Promise((resolve) => {
        chrome.storage.sync.set({ apiKey: newApiKey }, resolve);
      });
      
      userApiKey = newApiKey;
      
      settingsStatusMessage.textContent = 'API Key saved successfully!';
      settingsStatusMessage.className = 'status-message status-success show';

      await checkApiAndKeyStatus();

    } catch (error) {
      settingsStatusMessage.textContent = 'Error saving key.';
      settingsStatusMessage.className = 'status-message status-error show';
    } finally {
      saveApiKeyBtn.disabled = false;
      saveApiKeyBtn.textContent = 'Save Key';
      setTimeout(() => { 
        settingsStatusMessage.classList.remove('show');
        setTimeout(() => { settingsStatusMessage.textContent = ''; }, 300);
      }, 3000);
    }
  });

  // --- Initial Load Logic ---
  getApiKey().then((foundKey) => {
    if (!foundKey) {
      viewContainer.classList.add('show-settings');
    }
    checkApiAndKeyStatus();
    setInterval(checkApiAndKeyStatus, 60000);

    const urlParams = new URLSearchParams(window.location.search);
    const magnetFromUrl = urlParams.get('magnetURI');

    if (magnetFromUrl) {
      magnetInput.value = magnetFromUrl;
      loadTorrent();
    } else {
      chrome.storage.local.get(['lastMagnet', 'lastVideoFileIndex', 'lastSrtFileIndex', 'lastFileName', 'lastSubtitleTaskId', 'lastVttUrl'], function(data) {
        if (data.lastMagnet && data.lastVideoFileIndex !== -1) {
          resumeTorrent(data);
        } else {
          updateStatus('Ready');
          loadBtn.disabled = false;
        }
      });
    }
  });
});