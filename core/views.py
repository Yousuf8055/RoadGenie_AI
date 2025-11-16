import os
import json
import requests 
import re 
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from .models import Conversation
from django.contrib import messages
from django.contrib.auth.models import User

# --- Constants ---
# !! PASTE YOUR API KEY HERE !!
API_KEY = os.getenv("API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=" + API_KEY
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# NEW: OSRM Routing Service (Public Demo Server)
OSRM_ROUTE_URL = "http://router.project-osrm.org/route/v1/driving/"


# --- GeoCoding & Routing Functions ---

def geocode_address(location_name):
    """Translates a location name into [lat, lon] coordinates using Nominatim."""
    params = {'q': location_name, 'format': 'json', 'limit': 1}
    headers = {'User-Agent': 'RoadGenieHackathon/1.0'} 
    
    try:
        response = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=5)
        response.raise_for_status()
        results = response.json()
        
        if results and len(results) > 0:
            lat = float(results[0].get('lat'))
            lon = float(results[0].get('lon'))
            return [lat, lon]
        
    except requests.RequestException as e:
        print(f"Nominatim GeoCoding Error: {e}")
    return None

def get_route_polyline(start_coords, end_coords):
    """
    Calls OSRM to get a detailed route polyline between two points.
    Returns a list of [lat, lon] coordinates for the route.
    """
    # OSRM requires coordinates in [lon, lat] format for the URL
    coords_str = f"{start_coords[1]},{start_coords[0]};{end_coords[1]},{end_coords[0]}"
    url = f"{OSRM_ROUTE_URL}{coords_str}"
    
    params = {'geometries': 'geojson'} # Request the route geometry
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get('routes'):
            # The geometry is a list of [lon, lat] pairs. We must convert it to [lat, lon].
            polyline_lon_lat = data['routes'][0]['geometry']['coordinates']
            return [[lat, lon] for lon, lat in polyline_lon_lat]
            
    except requests.RequestException as e:
        print(f"OSRM Routing Error: {e}")
    except Exception as e:
        print(f"Routing Parsing Error: {e}")
    return None


# --- Authentication Views (No Change) ---

def signup_user(request):
    """Handles user signup (creation) logic."""
    if request.user.is_authenticated:
        return redirect('dashboard')
    
    if request.method == 'POST':
        email = request.POST.get('username')
        if User.objects.filter(email=email).exists() or User.objects.filter(username=email).exists():
             messages.error(request, 'An account with this email already exists.')
             return render(request, 'core/signup.html', {'form': UserCreationForm(request.POST)})

        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save(commit=False)
            user.email = user.username 
            user.save()
            messages.success(request, 'Account created successfully! Please log in.')
            return redirect('login')
        else:
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f"{error}")
    else:
        form = UserCreationForm()
        
    return render(request, 'core/signup.html', {'form': form})


def login_user(request):
    """Handles user login logic."""
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    if request.method == 'POST':
        username = request.POST.get('email') 
        password = request.POST.get('password')
        
        if not username or not password:
            messages.error(request, 'Please provide both email and password.')
            return render(request, 'core/login.html')

        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            login(request, user)
            messages.success(request, f"Welcome back, {user.username}!")
            return redirect('dashboard') 
        else:
            messages.error(request, 'Invalid email or password.')
            
    return render(request, 'core/login.html')


@login_required 
def logout_user(request):
    """Logs out the user and redirects to login."""
    logout(request)
    messages.info(request, "You have been logged out.")
    return redirect('login')


@login_required(login_url='login')
def frontend_view(request):
    """Renders the dashboard and loads the user's existing chat history."""
    chat_history = Conversation.objects.filter(user=request.user).order_by('timestamp')
    
    context = {
        'chat_history': chat_history
    }
    return render(request, 'core/index.html', context)


# --- API View (Full Routing Integrated) ---

@csrf_exempt
@login_required
def chat_api(request):
    if request.method == 'POST':
        current_user = request.user 
        map_action = None 
        
        try:
            data = json.loads(request.body)
            user_message = data.get('message', '').strip()
            
            if not user_message:
                return JsonResponse({'error': 'Message cannot be empty.'}, status=400)

            # 1. System Instruction: Ask Gemini to provide both start and end locations.
            system_prompt = (
                "You are RoadGenie, an AI co-pilot. Keep responses concise (1-2 sentences). Do not use Markdown. "
                "If the user asks for a route between two points, "
                "YOU MUST include a target location tag for the START point and the END point, like this: "
                "'[START: Hyderabad, India][END: India Gate, New Delhi]'. "
                "Also include the phrase 'new route suggested' in your conversation text to trigger the route action."
            )
            
            payload = {
                "contents": [{"parts": [{"text": user_message}]}],
                "systemInstruction": {"parts": [{"text": system_prompt}]}
            }

            # 2. Call the LIVE Gemini API
            ai_response_text = "Sorry, I couldn't connect to the AI brain. Check your API key and network."
            try:
                response = requests.post(
                    GEMINI_API_URL, 
                    headers={'Content-Type': 'application/json'}, 
                    data=json.dumps(payload),
                    timeout=15
                )
                response.raise_for_status() 
                
                result = response.json()
                candidate = result.get('candidates', [{}])[0]
                ai_response_text = candidate.get('content', {}).get('parts', [{}])[0].get('text', ai_response_text)
            
            except requests.exceptions.RequestException as e:
                print(f"Gemini API Error: {e}")
                ai_response_text = f"Error connecting to AI: Please check your API key."
            
            
            # 3. --- FULL ROUTING LOGIC ---
            response_lower = ai_response_text.lower()
            
            # Regex to extract start and end locations
            start_match = re.search(r'\[START:\s*(.+?)\]', ai_response_text, re.IGNORECASE)
            end_match = re.search(r'\[END:\s*(.+?)\]', ai_response_text, re.IGNORECASE)
            
            # Check for multi-point route request
            if "new route suggested" in response_lower and start_match and end_match:
                
                start_location = start_match.group(1).strip()
                end_location = end_match.group(1).strip()
                
                start_coords = geocode_address(start_location)
                end_coords = geocode_address(end_location)
                
                if start_coords and end_coords:
                    # Get the detailed route polyline from OSRM
                    route_polyline = get_route_polyline(start_coords, end_coords)
                    
                    if route_polyline:
                        map_action = {
                            "type": "new_route",
                            "coords": route_polyline,
                            "popup": f"Route from {start_location} to {end_location}"
                        }
                    else:
                        ai_response_text += " (Route calculation failed, showing pins only.)"
                        
                        # Fallback to just dropping pins if routing fails
                        map_action = {
                            "type": "add_pin",
                            "coords": end_coords,
                            "popup": f"Destination Pinned: {end_location}"
                        }
                else:
                    ai_response_text += " (Geocoding failed for one or both locations.)"
            
            elif "dropping a pin" in response_lower and end_match:
                 # Single pin drop (e.g., "Where is X?")
                end_location = end_match.group(1).strip()
                end_coords = geocode_address(end_location)
                if end_coords:
                     map_action = {
                        "type": "add_pin",
                        "coords": end_coords,
                        "popup": f"AI Pin: {end_location}"
                    }
                else:
                     ai_response_text += " (Geocoding failed for the location.)"
            
            # Clean the tags out of the final conversational response
            ai_response_text = re.sub(r'\[(START|END|LOCATION):\s*.+?\]', '', ai_response_text).strip()

            # 4. Save conversation
            Conversation.objects.create(
                user=current_user,
                user_message=user_message,
                ai_response=ai_response_text
            )
            
            # 5. Return response
            return JsonResponse({'response': ai_response_text, 'map_action': map_action})

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid request format.'}, status=400)
        except Exception as e:
            print(f"Critical Server Error in chat_api: {e}")
            return JsonResponse({'error': f'Critical Server Error: {str(e)}'}, status=500)

    return JsonResponse({'error': 'Method not allowed.'}, status=405)