// --- Global App Variables ---
let map;
const CHAT_API_URL = '/api/chat/';
let aiRouteLayer; // Global layer to hold and clear the AI-suggested route

// --- Utility Functions ---

// Helper function to get the CSRF token from cookies (REQUIRED by Django for POST requests)
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Map Initialization (Draws the base mock map)
function initMap() {
    if (document.getElementById('map') && !map) {
        map = L.map('map').setView([37.7749, -122.4194], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18,
        }).addTo(map);

        // Mock location and route markers for visualization
        L.circle([37.7749, -122.4194], {
            color: '#2CBDFE',
            fillColor: '#2CBDFE',
            fillOpacity: 0.5,
            radius: 200
        }).addTo(map);
        
        const mockRoute = [
            [37.7749, -122.4194],
            [37.785, -122.405],
            [37.80, -122.43]
        ];
        L.polyline(mockRoute, {
            color: '#7F5AF0', 
            weight: 6,
            opacity: 0.9,
            dashArray: '10, 5'
        }).addTo(map).bindPopup("Optimized Route by RoadGenie");
    }
}

// --- PHASE 2: Map Helper Functions (To be called by the API response) ---
/** Adds a marker pin to the Leaflet map. */
function addPinToMap(coords, popupText) {
    if (map) {
        L.marker(coords).addTo(map)
            .bindPopup(popupText)
            .openPopup();
        map.setView(coords, 14); // Pan and zoom to the new pin
    }
}

/** Draws a new route line on the Leaflet map, clearing the old one. */
function drawRouteOnMap(coords, popupText) {
    if (map) {
        // Clear the previous AI route if it exists
        if (aiRouteLayer) {
            map.removeLayer(aiRouteLayer);
        }
        
        // Draw the new route
        aiRouteLayer = L.polyline(coords, {
            color: '#FF5D5D', // Use the 'error' red for a new, bright route
            weight: 7,
            opacity: 0.9,
        }).addTo(map).bindPopup(popupText);
        
        // Fit the map to the new route's bounds
        map.fitBounds(aiRouteLayer.getBounds());
    }
}
// --- END OF PHASE 2 HELPER FUNCTIONS ---


// --- Chat Logic (Messaging functions) ---
function appendMessage(text, sender) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', 'fade-in');
    
    // Apply styling based on sender
    if (sender === 'user') {
        messageDiv.classList.add('self-end', 'bg-primary-start', 'text-white', 'shadow-soft', 'p-3', 'rounded-xl', 'text-sm');
    } else if (sender === 'ai') {
        messageDiv.classList.add('self-start', 'shadow-soft', 'text-sm', 'p-3', 'rounded-xl', 'bg-background-light', 'text-paragraph');
    } else if (sender === 'error') {
        messageDiv.classList.add('self-start', 'shadow-soft', 'text-sm', 'p-3', 'rounded-xl', 'bg-error/20', 'text-error');
    }

    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    // Auto-scroll to the bottom for the newest message
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

// Handles form submission and API call to Django view
async function handleChatSubmission(e) {
    e.preventDefault();
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const message = userInput.value.trim();
    
    if (!message) {
        appendMessage("Message cannot be empty.", 'error'); 
        return;
    }

    appendMessage(message, 'user');
    userInput.value = '';

    // Disable UI during API call
    userInput.disabled = true;
    sendButton.disabled = true;
    sendButton.innerHTML = `<svg class="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    try {
        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') // SEND CSRF TOKEN
            },
            body: JSON.stringify({ message: message })
        });

        const data = await response.json();

        if (response.ok) {
            appendMessage(data.response, 'ai');
            
            // --- PHASE 2: Execute map actions based on backend response ---
            if (data.map_action) {
                if (data.map_action.type === 'add_pin') {
                    addPinToMap(data.map_action.coords, data.map_action.popup);
                } else if (data.map_action.type === 'new_route') {
                    drawRouteOnMap(data.map_action.coords, data.map_action.popup);
                }
            }
            // --- END OF PHASE 2 EXECUTION LOGIC ---

        } else {
            appendMessage(`Error: ${data.error || 'Could not reach RoadGenie AI.'}`, 'error');
        }
    } catch (error)
        {
        console.error('Fetch error:', error);
        appendMessage(`Connection Error: Check if the Django server is running.`, 'error');
    } finally {
        // Re-enable input and button
        userInput.disabled = false;
        sendButton.disabled = false;
        sendButton.innerHTML = 'Send';
        userInput.focus();
    }
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize map and chat logic if the elements exist
    if (document.getElementById('map')) {
        initMap();
        
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            chatForm.addEventListener('submit', handleChatSubmission);
        }
    }
});