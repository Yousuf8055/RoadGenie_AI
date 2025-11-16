// Firebase SDKs
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Utility Functions (displayMessage and initializeAuth omitted for brevity, logic remains the same) ---

/**
 * Displays a custom alert/error message in the UI.
 */
function displayMessage(message, type = 'error') {
    const messageContainer = document.getElementById('auth-message');
    if (!messageContainer) return;

    messageContainer.innerHTML = message;
    messageContainer.className = 'p-3 rounded-xl mb-4 text-sm font-semibold fade-in';

    switch (type) {
        case 'success':
            messageContainer.classList.add('bg-success/20', 'text-success');
            break;
        case 'warning':
            messageContainer.classList.add('bg-warning/20', 'text-warning');
            break;
        case 'error':
        default:
            messageContainer.classList.add('bg-error/20', 'text-error');
            break;
    }

    setTimeout(() => {
        messageContainer.innerHTML = '';
        messageContainer.className = '';
    }, 5000);
}


async function initializeAuth() {
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase Auth Initialization Error:", error);
    }
}


// --- Auth State Listener (Safety Net for passive changes) ---

onAuthStateChanged(auth, (user) => {
    const currentPath = window.location.pathname.replace(/\/$/, '');
    const dashboardPath = '/dashboard';
    const loginPath = '/login';

    if (user) {
        // If logged in, ensure we are on the dashboard
        if (currentPath !== dashboardPath && currentPath !== '/dashboard/') {
            window.location.href = '/dashboard/';
        }
    } else {
        // If logged out, ensure we are on the login screen
        if (currentPath === dashboardPath || currentPath === '/') {
            window.location.href = '/login/';
        }
    }
});


// --- Form Handlers (Guaranteed Direct Redirection) ---

/** Handles the Signup form submission. */
async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (password.length < 6) {
        displayMessage("Password must be at least 6 characters.", 'warning');
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Mock Firestore profile creation (for completeness)
        const userRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
        await setDoc(userRef, {
            email: user.email,
            createdAt: new Date(),
            lastLogin: new Date()
        });

        displayMessage("Signup successful! Please login to continue.", 'success');
        
        // CRITICAL FIX: Direct redirection after success
        setTimeout(() => {
            window.location.href = '/login/'; 
        }, 1500);
        
    } catch (error) {
        let errorMessage = "An unknown error occurred during signup.";
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = "This email is already in use. Try logging in.";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = "Invalid email address.";
        } else {
            errorMessage = "Error: " + error.message;
        }
        displayMessage(errorMessage);
    }
}

/** Handles the Login form submission. */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        
        displayMessage("Login successful! Redirecting to dashboard...", 'success');
        
        // CRITICAL FIX: Direct redirection after success
        setTimeout(() => {
            window.location.href = '/dashboard/'; // <-- GUARANTEED REDIRECT
        }, 1500);

    } catch (error) {
        let errorMessage = "An unknown error occurred during login.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = "Invalid email or password.";
        } else {
            errorMessage = "Error: " + error.message;
        }
        displayMessage(errorMessage);
    }
}

async function handleSignOut() {
    try {
        await signOut(auth);
        // Fallback redirection handled by onAuthStateChanged listener
    } catch (error) {
        console.error("Signout Error:", error);
    }
}


// Attach event listeners when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    const signOutButton = document.getElementById('signout-button');
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOut);
    }

    initializeAuth();
});

export { auth, db, initializeAuth, displayMessage };