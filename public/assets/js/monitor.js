// Connect to the monitor namespace
const socket = io('/monitor');

// Select DOM elements
const messagesContainer = document.getElementById('messages');
const filterInput = document.getElementById('filterInput');
const clearBtn = document.getElementById('clearBtn');
const pauseBtn = document.getElementById('pauseBtn');
const statusSpan = document.getElementById('status');

let isPaused = false;

/**
 * Adds a new message to the messages container.
 * @param {Object} messageData - The message data object.
 * @param {boolean} [prepend=false] - Whether to prepend the message instead of appending.
 */
function addMessage(messageData, prepend = false) {
    const filter = filterInput.value.toLowerCase();

    // Apply filter to messages
    if (filter && messageData.event && !messageData.event.toLowerCase().includes(filter)) {
        return;
    }

    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = 'message';

    // Add styling for special events
    if (messageData.event === 'connection') {
        messageElement.classList.add('connection');
    } else if (messageData.event === 'client_disconnected') {
        messageElement.classList.add('disconnection');
    }

    // Construct message HTML
    let html = `
        <div class="timestamp">${messageData.timestamp}</div>
        <div class="socketId">${messageData.socketId}</div>
        <div class="event">${messageData.event}</div>
    `;

    // Format message data as JSON if available
    if (messageData.data) {
        try {
            const formattedData = JSON.stringify(messageData.data, null, 2);
            html += `<div class="data">${formattedData}</div>`;
        } catch (e) {
            html += `<div class="data">Error formatting data: ${e.message}</div>`;
        }
    }

    messageElement.innerHTML = html;

    // Append or prepend message
    if (prepend) {
        messagesContainer.prepend(messageElement);
    } else {
        messagesContainer.appendChild(messageElement);
        if (!isPaused) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight; // Auto-scroll
        }
    }
}

// -------------------- Socket Event Handlers --------------------

// Handle connection event
socket.on('connect', () => {
    statusSpan.textContent = 'Connected to monitor';
    statusSpan.style.color = '#4CAF50';
});

// Handle disconnection event
socket.on('disconnect', () => {
    statusSpan.textContent = 'Disconnected from monitor';
    statusSpan.style.color = '#F44336';
});

// Receive recent messages on connection
socket.on('recent_messages', (messages) => {
    messagesContainer.innerHTML = '';
    messages.forEach(addMessage);
});

// Handle new incoming messages
socket.on('message_received', (messageData) => {
    if (!isPaused) addMessage(messageData);
});

socket.on('message_sent', (messageData) => {
    if (!isPaused) addMessage(messageData);
});

// Handle client disconnections
socket.on('client_disconnected', (data) => {
    if (!isPaused) {
        addMessage({ ...data, event: 'client_disconnected' });
    }
});

// -------------------- UI Event Listeners --------------------

// Clear messages
clearBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
});

// Pause/Resume message updates
pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
});

// Filter messages based on event type
filterInput.addEventListener('input', () => {
    const filter = filterInput.value.toLowerCase();
    const messages = messagesContainer.querySelectorAll('.message');

    messages.forEach(msg => {
        const eventEl = msg.querySelector('.event');
        msg.style.display = (!filter || eventEl.textContent.toLowerCase().includes(filter)) ? '' : 'none';
    });
});
