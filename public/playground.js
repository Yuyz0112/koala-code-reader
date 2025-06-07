let ws = null;
let analysisStarted = false;
let currentRequestType = null;
let currentRequestData = null;

// Global variables to store analysis data
let analysisData = {
  allSummaries: [],
  reducedOutput: ''
};

// DOM elements
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');

// Setup elements
const githubRepoInput = document.getElementById('githubRepoInput');
const githubRefInput = document.getElementById('githubRefInput');
const repoNameInput = document.getElementById('repoNameInput');
const mainGoalInput = document.getElementById('mainGoalInput');
const specificAreasInput = document.getElementById('specificAreasInput');
const fileStructureInput = document.getElementById('fileStructureInput');
const startBtn = document.getElementById('startBtn');
const fetchRepoBtn = document.getElementById('fetchRepoBtn');

// Interactive elements
const improveBasicInputForm = document.getElementById('improveBasicInputForm');
const userFeedbackForm = document.getElementById('userFeedbackForm');
const analysisCompleteForm = document.getElementById('analysisCompleteForm');
const disconnectBtn = document.getElementById('disconnectBtn');

function switchTab(tabName, targetElement = null) {
  // Remove active class from all tabs and tab contents
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  // Add active class to the target tab content
  const tabContent = document.getElementById(tabName);
  if (tabContent) {
    tabContent.classList.add('active');
  }

  // Add active class to corresponding tab button
  if (targetElement) {
    // Manual click - use provided element
    targetElement.classList.add('active');
  } else if (typeof event !== 'undefined' && event && event.target) {
    // Manual click with event
    event.target.classList.add('active');
  } else {
    // Auto switch - find the tab by onclick attribute
    const targetTab = document.querySelector(`[onclick*="switchTab('${tabName}')"]`);
    if (targetTab) {
      targetTab.classList.add('active');
    }
  }
}

function updateStatus(connected) {
  if (connected) {
    statusEl.textContent = 'Status: Connected';
    statusEl.className = 'status connected';
  } else {
    statusEl.textContent = 'Status: Disconnected';
    statusEl.className = 'status disconnected';
    disconnectBtn.disabled = true;
    analysisStarted = false;
    hideAllForms();
  }
}

function updateInteractiveState(enabled) {
  disconnectBtn.disabled = !enabled;
}

function connectAndStart() {
  // Disable button during connection attempt
  startBtn.disabled = true;
  startBtn.textContent = 'Connecting...';

  connect().then(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      startAnalysis();
      // Close the setup overlay
      document.getElementById('setupOverlay').style.display = 'none';
      startBtn.textContent = 'Start Analysis';
    }
  }).catch((error) => {
    // Re-enable button on connection failure
    startBtn.disabled = false;
    startBtn.textContent = 'Start Analysis';
    addMessage(`Connection failed: ${error}`, 'received');
  });
}

function updateContentDisplay(data) {
  // Store analysis data for completion display
  if (data.allSummaries) {
    analysisData.allSummaries = data.allSummaries;
  }
  if (data.reducedOutput) {
    analysisData.reducedOutput = data.reducedOutput;
  }

  // Update Current & Next tab - show file content instead of summary
  if (data.currentFile) {
    const currentFileEl = document.getElementById('currentFileDisplay');
    if (currentFileEl) {
      let currentFileContent = `File: ${data.currentFile.name}\n\n`;

      // Show file content if available, otherwise show analysis summary
      if (data.toAnalyzeContent) {
        currentFileContent += `Content:\n${data.toAnalyzeContent}`;
      } else if (data.currentFile.analysis?.summary) {
        currentFileContent += `Analysis Summary:\n${data.currentFile.analysis.summary}`;
      }

      const preEl = currentFileEl.querySelector('pre');
      if (preEl) {
        preEl.textContent = currentFileContent;
      }
    }
  }

  if (data.nextFile) {
    const nextFileEl = document.getElementById('nextFileDisplay');
    if (nextFileEl) {
      const nextFileContent = `File: ${data.nextFile.name}\nReason: ${data.nextFile.reason}`;
      const preEl = nextFileEl.querySelector('pre');
      if (preEl) {
        preEl.textContent = nextFileContent;
      }
    }
  }

  // Update Reduce Output tab
  if (data.reducedOutput) {
    const reduceOutputEl = document.getElementById('reduceOutputDisplay');
    if (reduceOutputEl) {
      const preEl = reduceOutputEl.querySelector('pre');
      if (preEl) {
        preEl.textContent = data.reducedOutput;
      }
    }
  }

  // Update All Summaries tab - fix the filename property
  if (data.allSummaries && data.allSummaries.length > 0) {
    const allSummariesEl = document.getElementById('allSummariesDisplay');
    if (allSummariesEl) {
      allSummariesEl.innerHTML = '';

      data.allSummaries.forEach((summary, index) => {
        const summaryItem = document.createElement('div');
        summaryItem.className = 'summary-item';
        summaryItem.innerHTML = `
          <h5>File ${index + 1}: ${summary.filename || summary.fileName || 'Unknown'}</h5>
          <p>${summary.summary || summary}</p>
        `;
        allSummariesEl.appendChild(summaryItem);
      });
    }
  }

  // Auto-switch tabs based on content
  autoSwitchTab(data);
}

function autoSwitchTab(data) {
  // If there's toAnalyzeContent (file content), switch to Current & Next tab
  if (data.toAnalyzeContent) {
    switchTab('currentNext');
  }
  // If there's reducedOutput update but no toAnalyzeContent, switch to Reduce Output tab
  else if (data.reducedOutput) {
    switchTab('reduceOutput');
  }
}

function hideAllForms() {
  improveBasicInputForm.classList.add('hidden');
  userFeedbackForm.classList.add('hidden');
  analysisCompleteForm.classList.add('hidden');
  document.getElementById('noFeedbackNeeded').classList.remove('hidden');
  currentRequestType = null;
  currentRequestData = null;
}

function showRequestForm(type, data) {
  hideAllForms();
  currentRequestType = type;
  currentRequestData = data;

  // Hide the "no feedback needed" section when showing forms
  document.getElementById('noFeedbackNeeded').classList.add('hidden');

  switch (type) {
    case 'improveBasicInput':
      showImproveBasicInputForm(data);
      break;
    case 'userFeedback':
      showUserFeedbackForm(data);
      break;
    default:
      // For other types, just show no feedback needed
      document.getElementById('noFeedbackNeeded').classList.remove('hidden');
      break;
  }
}

function showImproveBasicInputForm(data) {
  const basicData = data.value?.basic || data.basic || {};

  // Show askUser information if available
  const askUserInfo = document.getElementById('askUserInfo');
  const askUserMessage = document.getElementById('askUserMessage');

  if (basicData.askUser) {
    askUserMessage.textContent = basicData.askUser;
    askUserInfo.style.display = 'block';
  } else {
    askUserInfo.style.display = 'none';
  }

  document.getElementById('improvedRepoName').value = basicData.repoName || '';
  document.getElementById('improvedMainGoal').value = basicData.mainGoal || '';
  document.getElementById('improvedSpecificAreas').value = basicData.specificAreas || '';
  document.getElementById('improvedFileStructure').value = basicData.fileStructure || '';

  improveBasicInputForm.classList.remove('hidden');
}

function showUserFeedbackForm(data) {
  const contextData = data.value || data;
  let contextHtml = '';

  if (contextData.currentFile) {
    contextHtml += `<strong>Current File:</strong> ${contextData.currentFile.name}<br>`;
    if (contextData.currentFile.analysis?.summary) {
      contextHtml += `<strong>Analysis Summary:</strong><br>${contextData.currentFile.analysis.summary}<br><br>`;
    }
  }

  if (contextData.nextFile) {
    contextHtml += `<strong>Next File:</strong> ${contextData.nextFile.name}<br>`;
    contextHtml += `<strong>Reason:</strong> ${contextData.nextFile.reason}`;
  }

  document.getElementById('feedbackContext').innerHTML = contextHtml || 'No context available';
  document.getElementById('feedbackAction').value = 'accept';
  document.getElementById('feedbackReason').value = '';
  document.getElementById('feedbackUserSummary').value = '';
  updateFeedbackForm();

  userFeedbackForm.classList.remove('hidden');
}

function updateFeedbackForm() {
  const action = document.getElementById('feedbackAction').value;
  const reasonRow = document.getElementById('feedbackReasonRow');
  const refinedRow = document.getElementById('feedbackRefinedRow');
  const reasonInput = document.getElementById('feedbackReason');

  if (action === 'accept') {
    reasonRow.classList.remove('hidden');
    refinedRow.classList.add('hidden');
    reasonInput.placeholder = 'Optional reason for accepting...';
  } else if (action === 'reject') {
    reasonRow.classList.remove('hidden');
    refinedRow.classList.add('hidden');
    reasonInput.placeholder = 'Required reason for rejecting...';
  } else if (action === 'refined') {
    reasonRow.classList.remove('hidden');
    refinedRow.classList.remove('hidden');
    reasonInput.placeholder = 'Optional reason for refinement...';
  }
}

function sendImprovedBasicInput() {
  const improvedData = {
    basic: {
      repoName: document.getElementById('improvedRepoName').value.trim(),
      mainGoal: document.getElementById('improvedMainGoal').value.trim(),
      specificAreas: document.getElementById('improvedSpecificAreas').value.trim() || undefined,
      fileStructure: document.getElementById('improvedFileStructure').value.trim()
    }
  };

  const messageData = {
    type: 'improveBasicInput',
    value: JSON.stringify(improvedData)
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(messageData));
    addMessage(messageData, 'sent');
    hideAllForms();
  }
}

function sendUserFeedback() {
  const action = document.getElementById('feedbackAction').value;
  const reason = document.getElementById('feedbackReason').value.trim();
  const userSummary = document.getElementById('feedbackUserSummary').value.trim();

  let feedbackData = { action };

  if (action === 'accept') {
    if (reason) feedbackData.reason = reason;
  } else if (action === 'reject') {
    if (!reason) {
      alert('Reason is required for rejection');
      return;
    }
    feedbackData.reason = reason;
  } else if (action === 'refined') {
    if (!userSummary) {
      alert('Refined summary is required');
      return;
    }
    feedbackData.userSummary = userSummary;
    if (reason) feedbackData.reason = reason;
  }

  const responseData = {
    type: 'userFeedback',
    value: JSON.stringify({ userFeedback: feedbackData })
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(responseData));
    addMessage(responseData, 'sent');
    hideAllForms();
  }
}

function addMessage(content, type, isAutoFilled = false) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}${isAutoFilled ? ' auto-filled' : ''}`;

  const timestamp = new Date().toLocaleTimeString();
  const displayContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;

  messageEl.innerHTML = `
    <div class="timestamp">[${timestamp}]${isAutoFilled ? ' (Auto-filled)' : ''}</div>
    <div>${displayContent}</div>
  `;

  messagesEl.appendChild(messageEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function connect() {
  return new Promise((resolve, reject) => {
    const wsUrl = window.location.protocol === 'https:' ?
      `wss://${window.location.host}/ws` :
      `ws://${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = function (event) {
      updateStatus(true);
      addMessage('Connected to WebSocket server', 'received');
      resolve();
    };

    ws.onmessage = function (event) {
      let data = event.data;
      let isAutoFilled = false;

      // Try to parse as JSON
      try {
        const parsedData = JSON.parse(data);

        // Check if it's a request from the server that needs user interaction
        if (parsedData && typeof parsedData === 'object' && 'type' in parsedData) {

          // Handle content display updates
          if (parsedData.type === 'contentUpdate' && parsedData.value) {
            updateContentDisplay(parsedData.value);
            addMessage(parsedData, 'received', true);
            return;
          }

          if (analysisStarted && (
            parsedData.type === 'improveBasicInput' ||
            parsedData.type === 'userFeedback' ||
            parsedData.type === 'finishFlow'
          )) {
            // This is a request that needs user interaction
            if (parsedData.type === 'finishFlow') {
              showAnalysisComplete();
              addMessage('🎉 Analysis completed successfully!', 'received');
            } else {
              showRequestForm(parsedData.type, parsedData);
              isAutoFilled = true;
            }
          }
        }

        addMessage(parsedData, 'received', isAutoFilled);
      } catch (error) {
        // If parsing fails, display as raw text
        addMessage(data, 'received');
      }
    };

    ws.onclose = function (event) {
      updateStatus(false);
      addMessage('Connection closed', 'received');
    };

    ws.onerror = function (error) {
      addMessage(`Error: ${error}`, 'received');
      reject(error);
    };
  });
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

function startAnalysis() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const setupData = {
      type: "start",
      value: {
        repoName: repoNameInput.value.trim(),
        mainGoal: mainGoalInput.value.trim(),
        specificAreas: specificAreasInput.value.trim() || undefined,
        fileStructure: fileStructureInput.value.trim(),
        githubUrl: githubRepoInput.value.trim() || undefined,
        githubRef: githubRefInput.value.trim() || 'main'
      }
    };

    ws.send(JSON.stringify(setupData));
    addMessage(setupData, 'sent');

    analysisStarted = true;
    updateInteractiveState(true);
  }
}

function clearMessages() {
  messagesEl.innerHTML = '';
}

// Add keyboard shortcuts for feedback forms
document.addEventListener('DOMContentLoaded', function () {
  const feedbackReason = document.getElementById('feedbackReason');
  const feedbackUserSummary = document.getElementById('feedbackUserSummary');

  if (feedbackReason) {
    feedbackReason.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        sendUserFeedback();
      }
    });
  }

  if (feedbackUserSummary) {
    feedbackUserSummary.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        sendUserFeedback();
      }
    });
  }
});

// Initialize
updateStatus(false);
// Ensure start button is enabled for the new merged connect/start functionality
startBtn.disabled = false;

async function fetchGitHubRepo() {
  const repoUrl = githubRepoInput.value.trim();
  const ref = githubRefInput.value.trim() || 'main';

  if (!repoUrl) {
    alert('Please enter a GitHub repository URL');
    return;
  }

  // Parse GitHub URL to extract owner and repo name
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    alert('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)');
    return;
  }

  const [, owner, repo] = match;
  const repoName = repo.replace(/\.git$/, ''); // Remove .git suffix if present

  // Update repo name
  repoNameInput.value = repoName;

  // Disable button and show loading state
  fetchRepoBtn.disabled = true;
  fetchRepoBtn.textContent = 'Fetching...';

  try {
    // Use our backend API endpoint with ref parameter to avoid CORS issues
    const response = await fetch(`/api/github/${owner}/${repoName}?ref=${encodeURIComponent(ref)}`);
    if (!response.ok) {
      const errorData = await response.json();
      let errorMessage = errorData.error || `HTTP ${response.status}`;

      // Provide helpful messages for common GitHub API errors
      if (response.status === 403) {
        errorMessage += '\n\nNote: GitHub API rate limit may have been reached. Consider adding a GitHub token to increase limits.';
      } else if (response.status === 404) {
        errorMessage = 'Repository or branch not found. Please check the URL and branch name, and ensure the repository is public.';
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    updateFileStructure(data);
    addMessage(`Successfully fetched repository info for ${owner}/${repoName} (${ref})`, 'received');

    // Update description if available
    if (data.description) {
      addMessage(`Repository description: ${data.description}`, 'received');
    }
  } catch (error) {
    console.error('GitHub fetch error:', error);
    alert(`Error fetching repository: ${error.message}`);
    addMessage(`Error fetching repository: ${error.message}`, 'received');
  } finally {
    // Re-enable button
    fetchRepoBtn.disabled = false;
    fetchRepoBtn.textContent = 'Fetch Repo Info';
  }
}

function updateFileStructure(data) {
  if (!data.tree) {
    return;
  }

  // Build directory structure representation
  const structure = buildTreeStructure(data.tree);
  fileStructureInput.value = structure;
}

function buildTreeStructure(tree) {
  // Sort items: directories first, then by path
  const sorted = [...tree].sort((a, b) => {
    // Extract directory path for comparison
    const aDir = a.path.includes('/') ? a.path.substring(0, a.path.lastIndexOf('/')) : '';
    const bDir = b.path.includes('/') ? b.path.substring(0, b.path.lastIndexOf('/')) : '';

    // If in same directory, directories come before files
    if (aDir === bDir && a.type !== b.type) {
      return a.type === 'tree' ? -1 : 1;
    }

    // Otherwise sort by path
    return a.path.localeCompare(b.path);
  });

  // Build tree structure
  const root = { _children: {} };

  sorted.forEach(item => {
    const parts = item.path.split('/');
    let current = root;

    parts.forEach((part, index) => {
      if (!current._children[part]) {
        current._children[part] = {
          name: part,
          type: index === parts.length - 1 ? item.type : 'tree',
          _children: {}
        };
      }
      current = current._children[part];
    });
  });

  // Render tree
  let output = '.\n';

  function renderNode(node, indent = '', isLast = false) {
    const children = Object.values(node._children);

    children.forEach((child, index) => {
      const isLastChild = index === children.length - 1;
      const prefix = isLast ? '    ' : '│   ';
      const connector = isLastChild ? '└── ' : '├── ';

      output += indent + connector + child.name;
      if (child.type === 'tree') output += '/';
      output += '\n';

      if (Object.keys(child._children).length > 0) {
        renderNode(child, indent + prefix, isLastChild);
      }
    });
  }

  renderNode(root);
  return output;
}

function showAnalysisComplete() {
  hideAllForms();

  // Hide the "no feedback needed" section when showing completion
  document.getElementById('noFeedbackNeeded').classList.add('hidden');

  // Update statistics
  const filesCount = analysisData.allSummaries ? analysisData.allSummaries.length : 0;
  const summariesCount = filesCount;
  const hasReducedOutput = analysisData.reducedOutput && analysisData.reducedOutput.trim() !== '';

  document.getElementById('filesAnalyzedCount').textContent = filesCount;
  document.getElementById('totalSummariesCount').textContent = summariesCount;
  document.getElementById('reducedOutputStatus').textContent = hasReducedOutput ? 'Yes' : 'No';

  // Show the completion form
  analysisCompleteForm.classList.remove('hidden');

  // Auto-switch to the "All Summaries" tab to show final results
  switchTab('allSummaries');
}

function exportAnalysisResults() {
  const results = {
    timestamp: new Date().toISOString(),
    analysis: {
      allSummaries: analysisData.allSummaries,
      reducedOutput: analysisData.reducedOutput,
      totalFiles: analysisData.allSummaries ? analysisData.allSummaries.length : 0
    }
  };

  const dataStr = JSON.stringify(results, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `koala-analysis-results-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  addMessage('📥 Analysis results exported successfully!', 'auto-filled');
}

function viewFinalSummary() {
  // Switch to the "Reduce Output" tab to show the final summary
  switchTab('reduceOutput');

  // Scroll the reduced output into view
  const reduceOutputDisplay = document.getElementById('reduceOutputDisplay');
  if (reduceOutputDisplay) {
    reduceOutputDisplay.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  addMessage('📋 Viewing final summary in Reduce Output tab', 'auto-filled');
}

function startNewAnalysis() {
  // Reset all data and show setup overlay
  analysisData = { allSummaries: [], reducedOutput: '' };

  // Clear all displays
  document.getElementById('currentFileDisplay').innerHTML = '<pre>No current file</pre>';
  document.getElementById('nextFileDisplay').innerHTML = '<pre>No next file</pre>';
  document.getElementById('reduceOutputDisplay').innerHTML = '<pre>No reduce output yet</pre>';
  document.getElementById('allSummariesDisplay').innerHTML = '<div class="content-block"><pre>No summaries yet</pre></div>';

  // Disconnect current connection and show setup
  disconnect();
  document.getElementById('setupOverlay').style.display = 'flex';

  addMessage('🔄 Starting new analysis session...', 'auto-filled');
}