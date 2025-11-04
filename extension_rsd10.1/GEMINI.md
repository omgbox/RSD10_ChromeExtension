# Project: Browser Extension

## Project Overview

This is a browser extension designed to enhance the video streaming experience on `rsd.ovh`. It provides two main functionalities:

1.  **Cast Button:** Injects a "Cast" button on `rsd.ovh/stream` pages, allowing users to cast the currently playing media to a Chromecast device.
2.  **Detached Video Player for Magnet Links:** Injects a "Play" button next to magnet links. Clicking this button opens a detached video player in a new window. This player attempts to stream the video content from the magnet link and automatically detects, extracts, and displays subtitles (SRT/VTT) associated with the video.

The extension utilizes a background script for handling API interactions (fetching torrent files, subtitle extraction), a content script for injecting UI elements and communicating with the background script, and a dedicated HTML/JS pair for the detached video player.

## Building and Running

This project is a Chrome Extension and does not require a traditional build process. To run and test the extension:

1.  **Load as Unpacked Extension:**
    *   Open Google Chrome.
    *   Navigate to `chrome://extensions/`.
    *   Enable "Developer mode" (usually a toggle in the top right corner).
    *   Click "Load unpacked" and select the `/home/extension/` directory.

2.  **Testing Functionality:**
    *   Navigate to an `rsd.ovh/stream` page to test the "Cast" button.
    *   Navigate to a page containing magnet links (e.g., a torrent indexer) to test the "Play" button and the detached video player with subtitle functionality.

## Development Conventions

*   **JavaScript:** Standard JavaScript practices are followed.
*   **Chrome Extension APIs:** Utilizes `chrome.runtime`, `chrome.tabs`, `chrome.windows`, and `chrome.offscreen` APIs for inter-component communication and browser functionality.
*   **API Interaction:** Interacts with an external API (`https://rsd.ovh`) for file listing, subtitle probing, and subtitle extraction.
*   **DOM Manipulation:** Content scripts directly manipulate the DOM of `rsd.ovh` pages to inject buttons.
*   **Subtitle Handling:** The background script handles the logic for finding the largest video file, identifying potential subtitle files (SRT, embedded in MKV), initiating subtitle extraction, and passing the resulting VTT URL to the detached player. The detached player dynamically adds the VTT track to the HTML5 video element.
