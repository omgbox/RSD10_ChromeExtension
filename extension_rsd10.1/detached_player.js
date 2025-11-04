// Annotation: This script initializes the detached video player, processes stream and subtitle URLs from parameters, and manages subtitle tracks.
// Script for the detached video player window.
// This script initializes the video player, handles URL parameters for streaming,
// and manages subtitle tracks.

document.addEventListener('DOMContentLoaded', async function() {
  const videoPlayer = document.getElementById('detachedVideoPlayer');
  // Parse URL parameters to get stream URL, VTT URL, and video filename.
  const urlParams = new URLSearchParams(window.location.search);
  const streamUrl = urlParams.get('streamUrl');
  const vttUrl = urlParams.get('vttUrl'); // Get VTT URL for subtitles
  const videoFilename = urlParams.get('videoFilename'); // Get video filename for window title

  // Set the window title to the video filename if available.
  if (videoFilename) {
    document.title = videoFilename;
  }

  // If a stream URL is provided, initialize the video player.
  if (streamUrl) {
    // If a VTT (subtitle) URL is provided, create and append a track element.
    if (vttUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = 'English';
      track.srclang = 'en';
      track.src = vttUrl;
      track.default = true;
      videoPlayer.appendChild(track);
      
      // Attempt to show subtitles by default once loaded.
      track.addEventListener('load', () => {
        if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
          for (let i = 0; i < videoPlayer.textTracks.length; i++) {
            const textTrack = videoPlayer.textTracks[i];
            if (textTrack.kind === 'subtitles' && textTrack.mode === 'disabled') {
              textTrack.mode = 'showing';
            }
          }
        }
      });
      track.addEventListener('error', (e) => {
        console.error('Detached player: Error loading subtitle track:', e);
      });
    }
    videoPlayer.src = streamUrl; // Set the video source.

  } else {
    console.error('No stream URL provided for detached player.');
  }
});
