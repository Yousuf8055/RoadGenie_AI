from django.contrib import admin
from .models import Conversation

@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('user', 'user_message', 'timestamp')
    list_filter = ('timestamp', 'user')
    search_fields = ('user__username', 'user_message')