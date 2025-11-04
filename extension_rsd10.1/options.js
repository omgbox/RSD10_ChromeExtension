// Annotation: This script manages the extension's options page, handling saving/restoring the API key and displaying its expiration status.
function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  chrome.storage.local.set({
    apiKey: apiKey
  }, function() {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    status.style.visibility = 'visible';
    setTimeout(function() {
      status.style.visibility = 'hidden';
    }, 750);
  });
}

function restoreOptions() {
  chrome.storage.local.get({
    apiKey: ''
  }, function(items) {
    document.getElementById('apiKey').value = items.apiKey;
  });
}

function getApiKeyStatus() {
  chrome.storage.local.get(['apiKey'], function(items) {
    const apiKey = items.apiKey;
    if (!apiKey) return;

    fetch('https://rsd.ovh/api-key-status', {
      headers: {
        'X-API-Key': apiKey
      }
    })
    .then(response => response.json())
    .then(data => {
      const expirationDateDiv = document.getElementById('expirationDate');
      if (data.expiresAt) {
        const expirationDate = new Date(data.expiresAt);
        expirationDateDiv.textContent = `API key expires on: ${expirationDate.toLocaleDateString()}`;
      } else {
        expirationDateDiv.textContent = data.message || 'Could not retrieve expiration date.';
      }
    })
    .catch(error => {
      console.error('Error fetching API key status:', error);
      const expirationDateDiv = document.getElementById('expirationDate');
      expirationDateDiv.textContent = 'Error retrieving expiration date.';
    });
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.addEventListener('DOMContentLoaded', getApiKeyStatus);
document.getElementById('save').addEventListener('click', saveOptions);
