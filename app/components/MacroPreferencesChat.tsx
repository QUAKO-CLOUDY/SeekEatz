"use client";

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ArrowRight, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import type { UserProfile } from '../types';

type Props = {
  userProfile?: UserProfile; // Made optional for easier testing
  onComplete?: () => void;
};

type Message = {
  id: string;
  type: 'user' | 'ai';
  content: string;
  suggestions?: string[];
  timestamp: Date;
};

const quickPrompts = [
  'High protein, low carb',
  'Meals under 500 calories',
  'Mediterranean food',
  'Budget-friendly options',
  'Quick meals < 15 mins',
];

export function MacroPreferencesChat({ 
  userProfile = { full_name: "Guest", target_calories: 1800, target_protein_g: 140, target_carbs_g: 100, target_fats_g: 60 }, 
  onComplete 
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: `Great! I've calculated your macros. You'll be targeting ${userProfile.target_calories} calories daily with ${userProfile.target_protein_g}g protein, ${userProfile.target_carbs_g}g carbs, and ${userProfile.target_fats_g}g fats.`,
      timestamp: new Date(),
    },
    {
      id: '2',
      type: 'ai',
      content: 'Now, tell me more about your meal preferences! What kind of meals are you looking for? Any specific macro distributions you prefer, or cuisines you love?',
      suggestions: quickPrompts.slice(0, 3),
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [conversationDepth, setConversationDepth] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateAIResponse = (userMessage: string): { content: string; suggestions?: string[] } => {
    const lowerMessage = userMessage.toLowerCase();
    let response = '';
    let suggestions: string[] | undefined;

    // First response after user input
    if (conversationDepth === 0) {
      if (lowerMessage.includes('high protein') || lowerMessage.includes('protein')) {
        response = `Perfect! I'll prioritize high-protein meals for you. With your ${userProfile.target_protein_g}g daily protein target, I'll show you meals with 30g+ protein per serving. Any specific protein sources you prefer - chicken, fish, plant-based?`;
        suggestions = ['Chicken and fish', 'Plant-based proteins', 'Mix of everything'];
      } else if (lowerMessage.includes('low carb') || lowerMessage.includes('keto')) {
        response = `Got it! I'll focus on low-carb options. Your carb target is ${userProfile.target_carbs_g}g daily, so I'll show meals under 30g carbs. Do you want strict keto-style meals, or moderate low-carb?`;
        suggestions = ['Strict keto (<20g)', 'Moderate low-carb', 'Flexible'];
      } else if (lowerMessage.includes('500') || lowerMessage.includes('calorie')) {
        response = `I'll find you satisfying meals under 500 calories! Since your daily target is ${userProfile.target_calories} calories, you'll have flexibility for snacks. Want these for lunch, dinner, or both?`;
        suggestions = ['Lunch options', 'Dinner options', 'Both meals'];
      } else if (lowerMessage.includes('mediterranean') || lowerMessage.includes('italian')) {
        response = `Mediterranean cuisine is amazing for balanced nutrition! Lots of lean proteins, healthy fats, and fresh veggies. I'll prioritize Mediterranean restaurants and meals. Any foods you especially love?`;
        suggestions = ['Grilled proteins', 'Seafood', 'Vegetarian'];
      } else {
        response = `Great! I'll keep that in mind when showing you meals. To make sure I find the perfect options, do you have any dietary preferences or foods you absolutely love?`;
        suggestions = ['No restrictions', 'High protein', 'Low carb'];
      }
    } 
    // Second level responses
    else if (conversationDepth === 1) {
      if (userProfile.goal) {
        const goalText = userProfile.goal.replace('-', ' ');
        response = `Perfect! I have everything I need to find you the best meals. I'll filter restaurants and grocery options based on your preferences and make sure they align with your ${goalText} goals.`;
      } else {
        response = `Perfect! I have everything I need to find you the best meals. I'll filter restaurants and grocery options based on your preferences and make sure they align with your nutrition goals.`;
      }
    } 
    // Catch-all for additional messages
    else {
      response = `Got it! I'm ready to help you find meals that match all your preferences. Let's get started!`;
    }

    return { content: response, suggestions };
  };

  const handleSendMessage = (text?: string) => {
    const messageText = text || inputValue.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setConversationDepth(prev => prev + 1);

    // Simulate AI response
    setTimeout(() => {
      const { content, suggestions } = generateAIResponse(messageText);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content,
        suggestions,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 600);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[600px] bg-card rounded-3xl shadow-2xl flex flex-col overflow-hidden border">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Sparkles className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-white font-bold text-xl mb-0.5">Tell Me Your Preferences</h1>
              <p className="text-white/90 text-sm">Let's customize your meal recommendations</p>
            </div>
          </div>

          {/* Macro Summary Pills */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-4 pb-1">
            <Badge variant="secondary" className="bg-white/20 backdrop-blur-sm text-white border-white/30 whitespace-nowrap px-3 h-7">
              <Check className="size-3 mr-1" />
              {userProfile.target_calories} cal
            </Badge>
            <Badge variant="secondary" className="bg-white/20 backdrop-blur-sm text-white border-white/30 whitespace-nowrap px-3 h-7">
              <Check className="size-3 mr-1" />
              {userProfile.target_protein_g}g pro
            </Badge>
            <Badge variant="secondary" className="bg-white/20 backdrop-blur-sm text-white border-white/30 whitespace-nowrap px-3 h-7">
              <Check className="size-3 mr-1" />
              {userProfile.target_carbs_g}g carb
            </Badge>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-background">
          {messages.map(message => (
            <div key={message.id}>
              <div
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-3xl px-5 py-4 ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                      : 'bg-muted border text-foreground'
                  }`}
                >
                  <p className="leading-relaxed text-sm">{message.content}</p>
                </div>
              </div>

              {/* AI Suggestions */}
              {message.suggestions && message.suggestions.length > 0 && (
                <div className="mt-3 space-y-2 ml-0 max-w-[85%]">
                  {message.suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendMessage(suggestion)}
                      className="w-full text-left bg-muted/50 hover:bg-muted border border-border hover:border-purple-500/50 rounded-2xl px-4 py-3 transition-all hover:shadow-sm group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-foreground text-sm">{suggestion}</span>
                        <ArrowRight className="size-4 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="px-6 py-3 bg-muted/10 border-t">
          <p className="text-muted-foreground text-xs mb-2 pl-1">Quick prompts:</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {quickPrompts.map((prompt, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="rounded-full whitespace-nowrap h-8 text-xs bg-background hover:border-purple-500 hover:text-purple-500"
                onClick={() => handleSendMessage(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-6 bg-background border-t">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Tell me what you're looking for..."
                className="rounded-full pr-4 py-6 bg-muted border-transparent focus:bg-background focus:border-purple-500"
              />
            </div>
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim()}
              className="rounded-full size-12 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-lg"
            >
              <Send className="size-5 text-white" />
            </Button>
          </div>
          
          {/* Skip/Continue Button */}
          {conversationDepth >= 1 && (
            <div className="mt-4 animate-in fade-in slide-in-from-bottom-2">
              <Button
                onClick={onComplete}
                className="w-full h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-lg text-white font-semibold"
              >
                Continue to App
                <ArrowRight className="ml-2 size-5" />
              </Button>
            </div>
          )}
          
          {conversationDepth === 0 && (
            <button
              onClick={onComplete}
              className="w-full mt-3 text-center text-muted-foreground hover:text-foreground transition-colors py-2 text-sm"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}