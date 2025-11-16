from django.contrib import admin
from django.urls import path
from core import views

urlpatterns = [
    path('admin/', admin.site.urls),

    # Authentication
    path('login/', views.login_user, name='login'),
    path('signup/', views.signup_user, name='signup'),
    path('logout/', views.logout_user, name='logout'),

    # Dashboard
    path('dashboard/', views.frontend_view, name='dashboard'),

    # API
    path('api/chat/', views.chat_api, name='chat_api'),

    # Default route → login page
    path('', views.login_user, name='home'),
]
