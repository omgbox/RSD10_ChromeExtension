// Annotation: This script injects UI elements (Cast and Play buttons) into web pages, manages subtitle extraction progress UI, and communicates with the background script.
// Content script for video streaming
// This script injects UI elements (Cast and Play buttons) into web pages
// and handles communication with the background script.

/**
 * Injects a 'Cast' button onto rsd.ovh stream pages.
 * This button allows users to cast the currently playing media to a Chromecast device.
 */
function injectCastButton() {
  // Check if we are on an rsd.ovh stream page and a video player exists
  if (window.location.href.includes('rsd.ovh/stream')) {
    const videoPlayer = document.querySelector('video');
    if (videoPlayer) {
      // Look for the controls bar, typically a parent element of the video
      // This might need adjustment depending on the exact DOM structure of the video player.
      const controlsContainer = videoPlayer.parentElement;

      if (controlsContainer) {
        const castButton = document.createElement('button');
        castButton.id = 'crush-cast-button';
        castButton.textContent = 'Cast'; // Or use an icon
        castButton.style.cssText = `
          margin-left: 10px;
          padding: 8px 12px;
          background-color: #f44336; /* Red color for Cast */
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        // Add a simple icon (you might want to use SVG or a proper icon font)
        castButton.innerHTML = `<svg style="margin-right: 5px;" width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM10 12l5 3-5 3V12z"/></svg>Cast`;

        // Find a good place to insert the button, e.g., next to fullscreen button.
        // This is a heuristic and might need fine-tuning for specific players.
        const fullscreenButton = controlsContainer.querySelector('button[title*="Fullscreen"], button[aria-label*="Fullscreen"]');
        if (fullscreenButton) {
          fullscreenButton.parentNode.insertBefore(castButton, fullscreenButton.nextSibling);
        } else {
          // Fallback if fullscreen button not found, append to controls container.
          controlsContainer.appendChild(castButton);
        }

        // Event listener for the Cast button click.
        castButton.addEventListener('click', () => {
          const mediaUrl = window.location.href;
          if (mediaUrl) {
            console.log('Sending cast request for:', mediaUrl);
            // Send a message to the background script to initiate casting.
            chrome.runtime.sendMessage({ action: 'castMedia', url: mediaUrl }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error sending cast message:', chrome.runtime.lastError.message);
              } else if (response && response.success) {
                console.log('Cast initiated successfully:', response.message);
                alert('Casting to Chromecast!');
              } else {
                console.error('Cast initiation failed:', response ? response.message : 'Unknown error');
                alert('Failed to cast video.');
              }
            });
          } else {
            console.error('Could not determine media URL for casting.');
            alert('Could not determine media URL for casting.');
          }
        });
      }
    }
  }
}

// Variables for managing subtitle progress and snackbar UI elements.
let subtitleProgressDiv = null;
let subtitleFileNameSpan = null;
let subtitleProgressTextSpan = null;
let subtitleProgressBar = null;
let snackbarDiv = null; 
let snackbarFileNameSpan = null;
let snackbarMessageSpan = null;

/**
 * Shortens a given filename for display purposes.
 * @param {string} fileName - The original filename.
 * @param {number} maxLength - The maximum desired length for the filename.
 * @returns {string} The shortened filename with ellipsis if necessary.
 */
function shortenFileName(fileName, maxLength = 40) {
  if (fileName.length <= maxLength) {
    return fileName;
  }
  const ellipsis = '...';
  const startLength = Math.ceil((maxLength - ellipsis.length) / 2);
  const endLength = Math.floor((maxLength - ellipsis.length) / 2);
  return fileName.substring(0, startLength) + ellipsis + fileName.substring(fileName.length - endLength, fileName.length);
}

/**
 * Displays a temporary snackbar message at the bottom of the screen.
 * @param {string} message - The main message to display.
 * @param {string} [fileName=''] - An optional filename to display alongside the message.
 */
function showSnackbar(message, fileName = '') {
  if (!snackbarDiv) {
    // Create snackbar elements if they don't exist.
    snackbarDiv = document.createElement('div');
    snackbarDiv.id = 'rsd-snackbar';
    snackbarDiv.className = 'rsd-snackbar';
    document.body.appendChild(snackbarDiv);

    snackbarMessageSpan = document.createElement('span');
    snackbarMessageSpan.id = 'rsd-snackbar-message';
    snackbarDiv.appendChild(snackbarMessageSpan);

    snackbarFileNameSpan = document.createElement('span');
    snackbarFileNameSpan.id = 'rsd-snackbar-file-name';
    snackbarFileNameSpan.style.cssText = `
      font-weight: bold;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    `;
    snackbarDiv.appendChild(snackbarFileNameSpan);
  }

  // Update snackbar content.
  if (snackbarMessageSpan) {
    snackbarMessageSpan.textContent = message;
  }
  if (snackbarFileNameSpan) {
    snackbarFileNameSpan.textContent = fileName ? shortenFileName(fileName) : '';
  }

  // Show the snackbar with animation.
  snackbarDiv.classList.remove('hide');
  snackbarDiv.classList.add('show');
}

/**
 * Hides the snackbar message.
 */
function hideSnackbar() {
  if (snackbarDiv) {
    snackbarDiv.classList.remove('show');
    snackbarDiv.classList.add('hide');
  }
}

/**
 * Displays a subtitle extraction progress indicator.
 * @param {string} message - The message to display (e.g., "Extracting...").
 * @param {number} [progress=0] - The current progress percentage (0-100).
 * @param {string} [fileName=''] - The name of the file for which subtitles are being extracted.
 */
function showSubtitleProgress(message, progress = 0, fileName = '') {
  if (!subtitleProgressDiv) {
    // Create subtitle progress elements if they don't exist.
    subtitleProgressDiv = document.createElement('div');
    subtitleProgressDiv.id = 'rsd-subtitle-progress';
    subtitleProgressDiv.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column; /* Arrange items vertically */
      align-items: center;
      gap: 5px; /* Smaller gap between lines */
      min-width: 250px;
      max-width: 90%; /* Prevent it from being too wide on small screens */
      text-align: center;
      opacity: 0; /* Start invisible for fade-in */
      transition: opacity 0.3s ease-in-out; /* Smooth opacity changes */
    `;

    subtitleFileNameSpan = document.createElement('span');
    subtitleFileNameSpan.id = 'rsd-subtitle-file-name';
    subtitleFileNameSpan.style.cssText = `
      font-weight: bold;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    `;
    subtitleProgressDiv.appendChild(subtitleFileNameSpan);

    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      justify-content: center;
    `;

    subtitleProgressTextSpan = document.createElement('span');
    subtitleProgressTextSpan.id = 'rsd-subtitle-progress-text';
    progressContainer.appendChild(subtitleProgressTextSpan);

    subtitleProgressBar = document.createElement('div');
    subtitleProgressBar.id = 'rsd-subtitle-progress-bar';
    subtitleProgressBar.style.cssText = `
      width: 100px;
      height: 8px;
      background-color: #555;
      border-radius: 4px;
      overflow: hidden;
    `;
    const fill = document.createElement('div');
    fill.style.cssText = `
      width: ${progress}%;
      height: 100%;
      background-color: #28a745;
      border-radius: 4px;
      transition: width 0.3s ease-in-out;
    `;
    subtitleProgressBar.appendChild(fill);
    progressContainer.appendChild(subtitleProgressBar);

    subtitleProgressDiv.appendChild(progressContainer);
    document.body.appendChild(subtitleProgressDiv);
  }

  // Update content of existing subtitle progress elements.
  if (fileName && subtitleFileNameSpan) {
    subtitleFileNameSpan.textContent = shortenFileName(fileName);
  } else if (subtitleFileNameSpan) {
    subtitleFileNameSpan.textContent = ''; // Clear if no filename
  }

  if (subtitleProgressTextSpan) {
    subtitleProgressTextSpan.textContent = message;
  }
  
  if (subtitleProgressBar && subtitleProgressBar.firstChild) {
    subtitleProgressBar.firstChild.style.width = `${progress}%`;
  }

  // Apply fade-in effect to show the progress indicator.
  subtitleProgressDiv.style.opacity = '1';
  subtitleProgressDiv.style.display = 'flex';
}

/**
 * Hides the subtitle extraction progress indicator.
 */
function hideSubtitleProgress() {
  if (subtitleProgressDiv) {
    // Apply fade-out effect and then hide after transition.
    subtitleProgressDiv.style.opacity = '0';
    subtitleProgressDiv.addEventListener('transitionend', function handler() {
      if (subtitleProgressDiv) {
        subtitleProgressDiv.style.display = 'none';
        subtitleProgressDiv.removeEventListener('transitionend', handler);
      }
    });
  }
}

/**
 * Finds magnet links on the page and injects a 'Play' button next to them.
 * Clicking this button opens a detached video player for the magnet link.
 */
function findAndInjectPlayButtons() {
  console.log('findAndInjectPlayButtons: Function called.');
  const magnetLinks = document.querySelectorAll('a[href^="magnet:"]');
  console.log('findAndInjectPlayButtons: Found magnet links:', magnetLinks.length);
  magnetLinks.forEach(link => {
    console.log('findAndInjectPlayButtons: Processing link:', link.href);
    // Check if a play button is already added to avoid duplicates.
    if (!link.nextElementSibling || !link.nextElementSibling.classList.contains('rsd-play-button')) {
      const playButton = document.createElement('button');
      playButton.className = 'rsd-play-button';
      playButton.textContent = '▶';
      playButton.title = 'Stream with RSD 9.9';

      // Event listener for the Play button click.
      playButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent the magnet link from being followed.
        const magnetURI = link.href;

        hideSubtitleProgress(); // Clear any previous progress display.
        // Send message to background script to open detached player.
        chrome.runtime.sendMessage({ action: 'openDetachedPlayer', magnetURI: magnetURI }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMessage = chrome.runtime.lastError.message;
            // Handle the common 'Extension context invalidated' error during development.
            if (errorMessage.includes('Extension context invalidated')) {
              console.error('Error: Extension context invalidated. Please refresh this page (F5) after reloading the extension.');
              showSubtitleProgress('Error: Extension reloaded. Please refresh this page.', 0);
            } else {
              console.error('Error sending message to background script:', errorMessage);
              showSubtitleProgress(`Error: ${errorMessage}`, 0);
            }
            setTimeout(hideSubtitleProgress, 3000);
            hideSnackbar(); // Hide snackbar on error
          } else if (response && response.success) {
            // Detached player opened successfully.
            hideSnackbar(); // Hide snackbar on success
          } else {
            console.error('Failed to open detached player:', response ? response.message : 'Unknown error');
            showSubtitleProgress(`Failed to open player: ${response ? response.message : 'Unknown error'}`, 0);
            setTimeout(hideSubtitleProgress, 3000);
            hideSnackbar(); // Hide snackbar on failure
          }
        });
      });

      // Insert the button directly after the magnet link.
      link.parentNode.insertBefore(playButton, link.nextSibling);

      // Add a CSS class to the parent element for better positioning if needed.
      if (!link.parentNode.classList.contains('rsd-magnet-container')) {
        link.parentNode.classList.add('rsd-magnet-container');
      }
    }
  });
}

// Listener for messages from the background script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle request to show a "preparing" snackbar.
  if (request.action === 'showPreparingSnackbar') {
    // Only show preparing snackbar for MP4 files (as per current logic).
    if (request.videoFileType === 'mp4') {
      showSnackbar("Preparing torrent and subtitles...", request.fileName);
    }
  } 
  // Handle subtitle extraction updates.
  else if (request.action === 'subtitleExtractionUpdate') {
    // Hide snackbar when subtitle progress messages start appearing.
    hideSnackbar();

    // Apply specific UI effects based on video file type and extraction status.
    if (request.videoFileType === 'mp4') {
      if (request.status === 'extracting') {
        showSubtitleProgress(request.message, request.progress, request.fileName);
        subtitleProgressDiv.classList.add('flash');
      } else if (request.status === 'complete') {
        showSubtitleProgress(request.message, 100, request.fileName);
        subtitleProgressDiv.classList.remove('flash');
        subtitleProgressDiv.classList.add('fade-out'); // Apply fade-out effect.
        setTimeout(() => {
          hideSubtitleProgress();
          subtitleProgressDiv.classList.remove('fade-out'); // Clean up class.
        }, 2000); // Hide after a short delay.
      } else if (request.status === 'error') {
        showSubtitleProgress(`Error: ${request.message}`, 0, request.fileName);
        subtitleProgressDiv.classList.remove('flash');
        setTimeout(hideSubtitleProgress, 3000);
      } else if (request.status === 'starting') {
        showSubtitleProgress(request.message, 0, request.fileName);
      }
    } else {
      // For other file types (e.g., MKV), revert to old behavior (no flashing/fading).
      if (request.status === 'extracting') {
        showSubtitleProgress(request.message, request.progress, request.fileName);
      } else if (request.status === 'complete') {
        showSubtitleProgress(request.message, 100, request.fileName);
        setTimeout(hideSubtitleProgress, 2000); // Hide after a short delay.
      } else if (request.status === 'error') {
        showSubtitleProgress(`Error: ${request.message}`, 0, request.fileName);
        setTimeout(hideSubtitleProgress, 3000);
      } else if (request.status === 'starting') {
        showSubtitleProgress(request.message, 0, request.fileName);
      }
    }
  }
});

// Observe DOM changes to inject buttons on dynamically loaded content.
// This ensures buttons are added even if content loads after initial page load.
const observer = new MutationObserver(findAndInjectPlayButtons);
observer.observe(document.body, { childList: true, subtree: true });

// Run the injection functions when the DOM is ready and on subsequent changes.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectCastButton();
    findAndInjectPlayButtons();
  });
} else {
  injectCastButton();
  findAndInjectPlayButtons();
}
