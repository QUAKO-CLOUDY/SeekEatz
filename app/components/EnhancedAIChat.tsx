"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Mic, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { MealCard } from "./MealCard";
// import { mockMeals } from "@/data/mockData"; // We will create this next
// import { useTheme } from "@/contexts/ThemeContext"; // We will create this next
// import { MACRO_COLORS } from "@/lib/themeColors"; // We will create this next

// --- PLACEHOLDER TYPES (We will move these to a types file later) ---
type Meal = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number; // Use "fats" (plural) to match Meal type
  restaurant?: string;
  image?: string;
  tags?: string[];
  price?: number;
  matchScore?: number;
};

type UserProfile = {
  name: string;
  calorieGoal: number;
};
// ------------------------------------------------------------------

type Message = {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
  meals?: Meal[];
  macroSuggestion?: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number; // Use "fats" (plural) to match Meal type
  };
};

type Props = {
  userProfile: UserProfile;
  onMealSelect: (meal: Meal) => void;
};

// Temporary mock data to make the UI work before we create the data files
const MOCK_MEALS: Meal[] = [
  {
    id: "1",
    name: "Grilled Chicken Bowl",
    calories: 550,
    protein: 45,
    carbs: 40,
    fats: 15, // Use "fats" (plural) to match Meal type
    restaurant: "Fresh & Co",
    price: 14.5,
  },
  {
    id: "2",
    name: "Salmon Salad",
    calories: 480,
    protein: 35,
    carbs: 12,
    fats: 22, // Use "fats" (plural) to match Meal type
    restaurant: "Green Leaf",
    price: 16.0,
  },
];

export function EnhancedAIChat({ userProfile, onMealSelect }: Props) {
  // Temporary theme mock until we install the context
  const resolvedTheme: string = "light"; 
const isDark = resolvedTheme === "dark";

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "ai",
      content: `Hi, I'm your AI meal assistant. I analyze thousands of local menus to curate the perfect meal for your goals.`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateAIResponse = (
    userMessage: string,
  ): { content: string; meals?: Meal[]; macroSuggestion?: any } => {
    const lowerMessage = userMessage.toLowerCase();
    let filteredMeals = [...MOCK_MEALS]; // Using local mock for now

    // Simple logic to simulate AI filtering
    if (
      lowerMessage.includes("under") ||
      lowerMessage.includes("low calorie")
    ) {
      filteredMeals = filteredMeals.filter((m) => m.calories < 600);
    }

    const macroSuggestion = {
      calories: 550,
      protein: 45,
      carbs: 52,
      fats: 18, // Use "fats" (plural) to match Meal type
    };

    return {
      content: `I found ${filteredMeals.length} options based on your request.`,
      meals: filteredMeals,
      macroSuggestion: lowerMessage.includes("macro")
        ? macroSuggestion
        : undefined,
    };
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    setTimeout(() => {
      const response = generateAIResponse(inputValue);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: response.content,
        timestamp: new Date(),
        meals: response.meals,
        macroSuggestion: response.macroSuggestion,
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 500);
  };

  const handleMicClick = () => {
    setIsListening(!isListening);
    if (!isListening) {
      setTimeout(() => {
        setIsListening(false);
        setInputValue("Find me a high protein lunch under 600 calories");
      }, 2000);
    }
  };

  const quickPrompts = [
    "Find lunch under 600 calories",
    "High protein breakfast",
    "Low carb dinner options",
    "Meal with 40g protein",
  ];

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden ${isDark ? "bg-gray-950" : "bg-white"}`}
    >
      {/* Header */}
      <div
        className={`px-4 py-4 border-b ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className={isDark ? "text-white" : "text-gray-900"}>
              AI Meal Assistant
            </h2>
            <p
              className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              Scanning menus for your perfect meal
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] ${message.type === "user" ? "order-2" : "order-1"}`}
            >
              {/* Message Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  message.type === "user"
                    ? "bg-gradient-to-r from-teal-500 to-blue-500 text-white ml-auto"
                    : isDark
                      ? "bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 text-white"
                      : "bg-gray-100 border border-gray-200 text-gray-900"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
                <p
                  className={`text-xs mt-1 ${message.type === "user" ? "text-white/70" : isDark ? "text-gray-500" : "text-gray-500"}`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {/* Macro Suggestion Card */}
              {message.macroSuggestion && (
                <Card
                  className={`mt-3 p-4 ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    <span
                      className={`text-sm ${isDark ? "text-white" : "text-gray-900"}`}
                    >
                      Recommended Macros
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {message.macroSuggestion.calories}
                      </div>
                      <div
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Cal
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {message.macroSuggestion.protein}g
                      </div>
                      <div
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Protein
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {message.macroSuggestion.carbs}g
                      </div>
                      <div
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Carbs
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {message.macroSuggestion.fats}g
                      </div>
                      <div
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Fat
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Meal Recommendations (Placeholder) */}
              {message.meals && message.meals.length > 0 && (
                <div className="mt-3 space-y-2">
                  {/* We will replace this with the real MealCard component next */}
                  {message.meals.map((meal) => (
                    <div
                      key={meal.id}
                      className="p-3 border rounded-lg bg-card cursor-pointer hover:bg-accent"
                      onClick={() => onMealSelect(meal)}
                    >
                      <p className="font-bold">{meal.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {meal.restaurant} • {meal.calories} cal
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      {messages.length <= 1 && (
        <div className={`px-4 pb-2 ${isDark ? "bg-gray-950" : "bg-white"}`}>
          <p
            className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            Try asking:
          </p>
          <div className="flex gap-2 flex-wrap">
            {quickPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setInputValue(prompt)}
                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                  isDark
                    ? "bg-gray-800 border border-gray-700 text-gray-300 hover:border-teal-500/50"
                    : "bg-gray-100 border border-gray-200 text-gray-700 hover:border-teal-500/50"
                }`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div
        className={`border-t ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} px-4 py-3 pb-24`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={handleMicClick}
            className={`p-3 rounded-full transition-all ${
              isListening
                ? "bg-gradient-to-r from-teal-500 to-blue-500 text-white animate-pulse"
                : isDark
                  ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask AI to find meals..."
              className={`h-12 rounded-2xl pr-12 ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                  : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-500"
              }`}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            size="icon"
            className={`rounded-full h-12 w-12 ${
              inputValue.trim()
                ? "bg-gradient-to-r from-teal-500 to-blue-500 text-white"
                : ""
            }`}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}