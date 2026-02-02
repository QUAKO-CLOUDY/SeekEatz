# AI SYSTEM BREAKDOWN

## 1. REPO STRUCTURE (Filtered)

```
my-meals-app/
├── app/
│   ├── api/                    # Server-side API routes
│   │   ├── chat/               # AI chat endpoint with intent routing
│   │   │   ├── route.ts        # Main chat handler (meal vs nutrition intent)
│   │   │   ├── reasoning/      # Reasoning-related endpoints
│   │   │   └── swaps/          # Meal swap functionality
│   │   ├── search/             # Vector search & meal recommendation
│   │   │   └── route.ts        # Main search endpoint (1289 lines)
│   │   ├── recommend/          # Meal recommendation endpoint
│   │   │   └── route.ts
│   │   ├── test-restaurants/   # Restaurant testing endpoint
│   │   │   └── route.ts
│   │   └── waitlist/           # Waitlist signup
│   │       └── route.ts
│   ├── components/             # React components
│   │   ├── AIChat.tsx          # Main AI chat UI component (1367 lines)
│   │   ├── EnhancedAIChat.tsx  # Enhanced chat variant
│   │   ├── MainApp.tsx         # Root app component with routing
│   │   ├── HomeScreen.tsx      # Home screen with search
│   │   ├── SearchScreen.tsx    # Search interface
│   │   ├── MealCard.tsx        # Meal display card
│   │   ├── MealDetail.tsx      # Meal detail view
│   │   ├── DailyLog.tsx        # Meal logging
│   │   ├── MacroPreferencesChat.tsx  # Macro configuration chat
│   │   ├── OnboardingFlow.tsx  # User onboarding
│   │   ├── WelcomeScreen.tsx   # Welcome screen
│   │   └── ui/                 # UI component library (48 files)
│   ├── chat/
│   │   └── page.tsx            # Chat page route
│   ├── types.ts                # TypeScript type definitions
│   └── hooks/
│       ├── useMealDistances.ts # Distance calculation hook
│       └── useSessionActivity.ts # Session tracking hook
├── lib/                        # Utility libraries
│   ├── supabaseClient.ts       # Supabase client setup
│   ├── image-utils.ts          # Image URL generation
│   ├── distance-utils.ts       # Distance calculations
│   └── constants.ts            # App constants
├── utils/                      # Additional utilities
│   ├── supabase/
│   │   ├── client.ts           # Client-side Supabase
│   │   └── server.ts           # Server-side Supabase
│   └── logos.ts                # Logo mapping
├── scripts/                    # Data ingestion scripts
│   ├── ingest-data.ts          # Bulk data import with embeddings (USE THIS)
│   ├── bulk-import.ts          # [DEPRECATED] Use ingest-data.ts instead
│   └── generate-embeddings.ts  # Embedding generation
└── data/
    └── jsons/                  # JSON meal data (51 files)
```

## 2. API ROUTES (Server Logic)

### app/api/chat/route.ts
- **Purpose**: Main AI chat endpoint with intent classification
- **Key Features**:
  - Intent classification (meal vs nutrition)
  - Routes meal requests to `/api/search`
  - Uses OpenAI for nutrition Q&A
  - System prompt: "You are MacroScout, a nutrition assistant..."
  - Model: `gpt-4o-mini` (via @ai-sdk/openai)
- **Request Body**:
  ```typescript
  {
    message: string;
    limit?: number;
    offset?: number;
    searchKey?: string;
    filters?: { restaurant?: string; [key: string]: any };
    userContext?: {
      search_distance_miles?: number;
      user_location_lat?: number;
      user_location_lng?: number;
    };
  }
  ```
- **Response Types**:
  - Meal intent: `{ meals, hasMore, nextOffset, searchKey }`
  - Nutrition intent: `{ mode: "text", answer: string }`

### app/api/search/route.ts (1289 lines)
- **Purpose**: Vector search & meal recommendation pipeline
- **Key Features**:
  - Embedding generation/caching (`text-embedding-3-small`)
  - Vector similarity search via Supabase RPC (`match_menu_items`)
  - Restaurant fuzzy search (`search_restaurants_trgm`)
  - LLM reranking for top 5 results
  - Search result caching
  - Macro constraint extraction (calories, protein, carbs, fat)
  - Distance-based filtering
- **Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (for cache writes)
  - `OPENAI_API_KEY`

### app/api/recommend/route.ts
- **Purpose**: Meal recommendation endpoint
- Uses OpenRouter API with OpenAI models

### app/api/test-restaurants/route.ts
- **Purpose**: Restaurant testing endpoint
- Uses OpenRouter API

### app/api/waitlist/route.ts
- **Purpose**: Waitlist signup handling

## 3. CHAT + AI ENTRY POINTS

### Main Chat Component: app/components/AIChat.tsx (1367 lines)

**Key State Management**:
- `messages`: Chat message history (persisted in sessionStorage)
- `isSignedIn`: Authentication state
- `hasReachedLimit`: Free chat limit tracking (3 free chats for anonymous users)
- Message storage key: `'seekeatz_chat_messages'`
- Free chat count: `'seekeatz_free_chat_count'` (sessionStorage + localStorage fallback)

**Chat Flow**:
1. User sends message → checks free chat limit (if not signed in)
2. Adds user message to state optimistically
3. Calls `/api/chat` endpoint
4. `/api/chat` classifies intent (meal vs nutrition)
5. **Meal intent**: Routes to `/api/search`, receives `{ meals, hasMore, nextOffset, searchKey }`
6. **Nutrition intent**: Receives `{ mode: "text", answer: string }`
7. Parses meal responses from `<MEAL_CARDS>` JSON blocks
8. Updates message state with assistant response
9. Logs to Supabase (`chat_messages` and `usage_events` tables)

**Key Functions**:
- `resetChat()`: Clears messages and sessionStorage (but NOT free chat count)
- `loadMoreMeals()`: Pagination for meal results using `searchKey` and `nextOffset`
- `logChatMessage()`: Logs to `chat_messages` table (authenticated users only)
- `logUsageEvent()`: Logs to `usage_events` table (chat_submit, chat_response, limit_hit)

**Free Chat Limit Logic**:
- Anonymous users: 3 free chats, then gate message appears
- Signed-in users: Unlimited
- Free chat count persists across sessions (localStorage fallback)

### Enhanced Chat: app/components/EnhancedAIChat.tsx
- Alternative chat implementation

### Chat Route: app/chat/page.tsx
- Simple page wrapper that renders AIChat component

### API Chat Route: app/api/chat/route.ts
- **Intent Classification**:
  ```typescript
  function classifyIntent(query: string): 'meal' | 'nutrition'
  ```
  - Meal intent: Contains meal keywords OR macro constraints OR diet keywords
  - Nutrition intent: Questions about nutrients (how much, what is, etc.)

## 4. SEARCH & RECOMMENDATION PIPELINE

### Vector Search Flow (app/api/search/route.ts)

1. **Query Processing**:
   - Normalizes query
   - Extracts calorie cap, protein min, carbs max, fat max
   - Detects meal intent vs general search
   - Handles restaurant name extraction

2. **Restaurant Fuzzy Search**:
   - Uses Supabase RPC: `search_restaurants_trgm`
   - Filters results by restaurant if match found

3. **Search Key Generation**:
   ```typescript
   generateSearchKey(query, calorieCap, radiusBucket, isMealIntent)
   ```
   - Used for pagination and caching
   - Format: `${normalizedQuery}_cap${calorieCap}_radius${radiusBucket}_meal`

4. **Cache Check**:
   - Checks `search_cache` table for existing results
   - Cache key: `${searchKey}_radius_${radiusBucket}`

5. **Embedding Generation/Caching**:
   - Checks embedding cache first
   - If missing, generates embedding via OpenAI: `text-embedding-3-small`
   - Caches embedding in `search_cache.embedding_json`

6. **Vector Similarity Search**:
   - Calls Supabase RPC: `match_menu_items(query_embedding, match_threshold, match_count)`
   - Returns items sorted by cosine similarity

7. **Filtering**:
   - Applies macro constraints (calories, protein, carbs, fat)
   - Filters by distance if location provided
   - Filters by restaurant if specified

8. **LLM Reranking**:
   - Uses OpenAI to select top 5 matches from filtered results
   - Model: `gpt-4o-mini`
   - Returns selected indices

9. **Result Caching**:
   - Stores final results in `search_cache.results_json`
   - Uses service role key for writes

10. **Response Format**:
    ```typescript
    {
      meals: Meal[];
      hasMore: boolean;
      nextOffset: number;
      searchKey: string;
      message?: string; // Summary message
    }
    ```

### Key Functions in Search Route

- `extractCalorieCap(query)`: Extracts max calories from query
- `extractMinProtein(query)`: Extracts minimum protein requirement
- `extractMaxCarbs(query)`: Extracts maximum carbs
- `extractMaxFat(query)`: Extracts maximum fat
- `isMealIntentQuery(query)`: Determines if query is meal-finding
- `generateMealSummary(query, mealCount)`: Creates summary message
- `llmRerank(openai, items, query)`: Uses LLM to select top 5 matches

### Supabase RPC Functions Used

- `match_menu_items(query_embedding, match_threshold, match_count)`: Vector similarity search
- `search_restaurants_trgm(query_text)`: Fuzzy restaurant name search

### Search Cache Table Structure

- `search_key`: Unique identifier for search
- `results_json`: Cached search results
- `embedding_json`: Cached query embeddings
- Cache expiry: TBD (implementation dependent)

## 5. UI → CHAT STATE FLOW

### Component Hierarchy

```
MainApp (app/components/MainApp.tsx)
├── Navigation (screen routing)
├── HomeScreen (home/search interface)
├── AIChat (chat interface)
├── MealDetail (meal detail view)
├── LogScreen (meal logging)
├── Favorites (favorite meals)
└── Settings (user settings)
```

### State Management Flow

**MainApp State**:
- `currentScreen`: 'home' | 'chat' | 'log' | 'favorites' | 'settings'
- `userProfile`: User preferences (targets, distance)
- `favoriteMeals`: Array of favorite meal IDs
- `loggedMeals`: Array of logged meals
- State persisted in localStorage

**AIChat State** (sessionStorage):
- `messages`: Chat message history
- `seekeatz_chat_messages`: Full message array (JSON)
- `seekeatz_chat_lastActivityAt`: Last activity timestamp
- `seekeatz_free_chat_count`: Free chat counter (anonymous users)

**HomeScreen State** (localStorage):
- `seekeatz_recommended_meals`: Cached meal results
- `seekeatz_has_searched`: Search state flag
- `seekeatz_last_search_params`: Last search parameters
- `seekeatz_selected_cuisine`: Selected cuisine filter

### Chat Message Flow

1. **User Input**:
   ```typescript
   setMessages(prev => [...prev, userMessage])
   ```

2. **API Call**:
   ```typescript
   fetch('/api/chat', {
     method: 'POST',
     body: JSON.stringify({
       message: inputText,
       limit: 10,
       offset: 0,
       userContext: { search_distance_miles, user_location_lat, user_location_lng }
     })
   })
   ```

3. **Response Handling**:
   - Meal response: Parses `<MEAL_CARDS>` JSON, extracts meals array
   - Text response: Displays answer directly
   - Updates messages state with assistant response

4. **Persistence**:
   ```typescript
   useEffect(() => {
     if (messages.length > 0) {
       sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
     }
   }, [messages]);
   ```

5. **Inactivity Reset**:
   - 30-minute inactivity timeout
   - Clears chat messages (but NOT free chat count)

### Navigation Flow

- Route: `/chat` → Renders AIChat component
- MainApp tracks `currentScreen` state
- Navigation component handles screen switching
- State persists across navigation

## 6. MACRO / SWAP / MEAL LOGIC

### Macro Extraction (app/api/search/route.ts)

**Calorie Cap**:
- Patterns: `under 500 cal`, `less than 1000 calories`, `<800 cal`
- Function: `extractCalorieCap(query)`
- Shared patterns in `CAL_PATTERNS` array

**Protein Minimum**:
- Patterns: `40g+ protein`, `high protein 40g`, `at least 30g protein`
- Function: `extractMinProtein(query)`
- Default: 30g for "high protein" without number

**Carbs Maximum**:
- Patterns: `under 30g carbs`, `low carb`, `keto`
- Function: `extractMaxCarbs(query)`

**Fat Maximum**:
- Patterns: `under 20g fat`, `low fat`
- Function: `extractMaxFat(query)`

### Macro Filtering

Applied in search pipeline:
```typescript
if (calorieCap && item.calories > calorieCap) continue;
if (minProtein && item.protein < minProtein) continue;
if (maxCarbs && item.carbs > maxCarbs) continue;
if (maxFat && item.fats > maxFat) continue;
```

### Meal Logging (app/components/LogScreen.tsx)

- `DailyLog`: Component for logging meals
- `LoggedMeal` type: Stores logged meal data
- Persisted in localStorage
- Tracks daily totals against user targets

### Meal Details (app/components/MealDetail.tsx)

- Displays full meal information
- Shows macros (calories, protein, carbs, fat)
- Favorite toggle
- Log meal button

### Swap Logic

- Located in `app/api/chat/swaps/` (directory exists)
- Meal swapping functionality (implementation TBD)

## 7. SUPABASE TOUCHPOINTS

### Client Creation

**Client-side** (`utils/supabase/client.ts`):
```typescript
createClient() // Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Server-side** (`utils/supabase/server.ts`):
```typescript
createClient() // Server-side Supabase client
```

**API Routes** (`app/api/search/route.ts`):
```typescript
const supabase = createClient(supabaseUrl, supabaseKey); // Anon key
const adminDb = createClient(supabaseUrl, serviceKey); // Service role key (for cache writes)
```

### Database Operations

**Tables Used**:
- `menu_items`: Main meal data with embeddings
- `restaurants`: Restaurant data
- `search_cache`: Cached search results and embeddings
- `chat_messages`: Chat message logs (authenticated users)
- `usage_events`: Usage analytics (chat_submit, chat_response, limit_hit)
- `profiles`: User profile data

**Common Operations**:

**Read Operations**:
```typescript
const { data, error } = await supabase
  .from('menu_items')
  .select('*')
  .limit(10);
```

**RPC Calls**:
```typescript
// Vector similarity search
const { data, error } = await supabase.rpc('match_menu_items', {
  query_embedding: embedding,
  match_threshold: 0.7,
  match_count: 50
});

// Restaurant fuzzy search
const { data: matches } = await supabase.rpc('search_restaurants_trgm', {
  query_text: restaurantName
});
```

**Write Operations** (Service Role Key):
```typescript
// Cache insertion
await adminDb.from('search_cache').upsert({
  search_key: cacheKey,
  results_json: results,
  embedding_json: embedding
});

// Chat message logging
await supabase.from('chat_messages').insert({
  user_id: userId,
  role: 'user',
  content: message
});
```

### Authentication

**Auth State Check**:
```typescript
const { data: { user }, error } = await supabase.auth.getUser();
```

**Auth State Change Listener**:
```typescript
supabase.auth.onAuthStateChange((event, session) => {
  setIsSignedIn(!!session?.user);
});
```

## 8. ENV + MODEL CONFIG

### Environment Variables

**Required**:
- `OPENAI_API_KEY`: OpenAI API key for embeddings and chat
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key (client-side)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (server-side, for cache writes)

**Optional**:
- `OPENROUTER_API_KEY`: Used in recommend and test-restaurants routes
- `NODE_ENV`: Development/production mode

### Model Configuration

**Embeddings**:
- Model: `text-embedding-3-small`
- Provider: OpenAI
- Usage: Query embeddings for vector search
- Cached in: `search_cache.embedding_json`

**Chat Completions**:
- Model: `gpt-4o-mini`
- Provider: OpenAI (via @ai-sdk/openai)
- Usage: Nutrition Q&A in chat endpoint
- System Prompt: "You are MacroScout, a nutrition assistant for a search-first nutrition app..."

**LLM Reranking**:
- Model: `gpt-4o-mini`
- Provider: OpenAI
- Usage: Select top 5 matches from search results
- System Prompt: "You are a meal recommendation assistant..."

**OpenRouter** (optional):
- Used in `/api/recommend` and `/api/test-restaurants`
- Model format: `openai/gpt-4o-mini`
- Requires `OPENROUTER_API_KEY`

### Model Usage Locations

1. **app/api/chat/route.ts**:
   - `generateText()` with `openai('gpt-4o-mini')` for nutrition Q&A

2. **app/api/search/route.ts**:
   - `openai.embeddings.create()` with `text-embedding-3-small` for query embeddings
   - `openai.chat.completions.create()` with `gpt-4o-mini` for LLM reranking

3. **scripts/ingest-data.ts**:
   - `openai.embeddings.create()` with `text-embedding-3-small` for menu item embeddings

4. **scripts/bulk-import.ts** (DEPRECATED):
   - This script is deprecated. Use scripts/ingest-data.ts instead.
   - Previously used `openai.embeddings.create()` with `text-embedding-3-small` for rich embeddings

5. **scripts/generate-embeddings.ts**:
   - `openai.embeddings.create()` with `text-embedding-3-small` for batch embedding generation

## 9. CHAT UI ENTRY SCREENS

### Entry Points

**Main Chat Interface**:
- Component: `app/components/AIChat.tsx`
- Route: `/chat` (app/chat/page.tsx)
- Props:
  - `userId`: Optional user ID
  - `userProfile`: User profile data
  - `favoriteMeals`: Array of favorite meals
  - `onMealSelect`: Callback for meal selection
  - `onToggleFavorite`: Callback for favorite toggle
  - `onSignInRequest`: Callback to trigger sign-in

**Home Screen**:
- Component: `app/components/HomeScreen.tsx`
- Route: `/home` (app/home/page.tsx)
- Features: Search interface, meal recommendations, cuisine filters

**Welcome/Onboarding**:
- `app/components/WelcomeScreen.tsx`: Initial welcome screen
- `app/components/WelcomeScreenV2.tsx`: Updated welcome variant
- `app/components/OnboardingFlow.tsx`: Full onboarding flow
- `app/components/SimplifiedOnboarding.tsx`: Simplified onboarding
- `app/components/MicroOnboarding.tsx`: Micro-interaction onboarding
- Route: `/onboarding` (app/onboarding/page.tsx)

**Main App Container**:
- Component: `app/components/MainApp.tsx`
- Root component that manages app state and routing
- Handles authentication flow
- Manages screen navigation
- Integrates all major components

### Screen Navigation

**Screens**:
- `home`: Home screen with search
- `chat`: AI chat interface
- `log`: Meal logging screen
- `favorites`: Favorite meals
- `settings`: User settings

**Navigation Component**:
- `app/components/Navigation.tsx`: Bottom navigation bar
- Manages screen switching
- Updates `currentScreen` state in MainApp

### Authentication Flow

1. **AuthScreen** (`app/components/AuthScreen.tsx`):
   - Sign in/sign up interface
   - Routes: `/auth/signin`, `/auth/signup`

2. **Auth State Management**:
   - Checks Supabase auth state
   - Updates `isSignedIn` state
   - Clears chat on sign-in (optional)
   - Resets free chat count on sign-in

3. **Protected Routes**:
   - Free chat limit for anonymous users
   - Unlimited chat for signed-in users
   - Gate message appears after 3 free chats

---

## Summary

This is a Next.js app that uses:
- **OpenAI** for embeddings (`text-embedding-3-small`) and chat completions (`gpt-4o-mini`)
- **Supabase** for vector search, database, and authentication
- **Vector similarity search** for meal recommendations
- **LLM reranking** to select top 5 matches
- **Intent classification** to route between meal search and nutrition Q&A
- **Session-based chat** with free chat limits for anonymous users
- **Caching** for search results and embeddings to reduce API costs

The main flow: User query → Intent classification → Meal search (vector similarity + LLM reranking) OR Nutrition Q&A (GPT-4o-mini) → Display results in chat UI.

