"use client";

import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Flame, 
  Zap, 
  TrendingUp, 
  Plus, 
  Heart, 
  Share, 
  ShieldCheck,
  Clock,
  MapPin,
  Info,
  ExternalLink,
  Sparkles,
  X,
  Check
} from 'lucide-react';
import type { Meal } from '../types';
import { copyToClipboard } from '@/lib/clipboard-utils';

// --- TYPES ---
type Props = {
  meal: Meal;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onLogMeal: () => void;
};

type SwapOption = {
  id: string;
  label: string;
  protein?: number;
  carbs?: number;
  fats?: number;
  calories: number;
};

// --- CONSTANTS ---
const SWAP_OPTIONS: SwapOption[] = [
  { id: 'protein', label: 'Add Extra Protein', protein: 15, calories: 75 },
  { id: 'carbs', label: 'Reduce Carbs', carbs: -20, calories: -80 },
  { id: 'fats', label: 'Add Healthy Fats', fats: 10, calories: 90 },
  { id: 'double', label: 'Double Protein', protein: 42, calories: 168 },
];

// --- HELPER LOGIC ---
function generateWhyText(meal: Meal): string {
  if (meal.protein > 35 && meal.calories < 600) return "High protein & low calorie cut-friendly option.";
  if (meal.carbs < 20) return "Low-carb option that fits your macro goals.";
  if (meal.calories > 800) return "High energy meal for intense training days.";
  return "Balanced macro profile with clean ingredients.";
}

// Helper to check if a swap suggestion is realistic for the restaurant
function isSwapAvailable(swapText: string, restaurant: string, mealDescription?: string): boolean {
  const restaurantLower = restaurant.toLowerCase();
  const swapLower = swapText.toLowerCase();
  
  // Check for known unavailable swaps by restaurant
  const unavailableSwaps: Record<string, string[]> = {
    'chipotle': ['cauliflower rice', 'cauliflower'],
    // Add more as needed
  };
  
  // Check restaurant-specific restrictions
  for (const [restName, restricted] of Object.entries(unavailableSwaps)) {
    if (restaurantLower.includes(restName)) {
      if (restricted.some(item => swapLower.includes(item))) {
        return false;
      }
    }
  }
  
  // Check if swap mentions an ingredient that might not be in the description
  // For now, allow all swaps that pass restaurant-specific checks
  // More sophisticated checking could parse meal description/ingredients
  
  return true;
}

function generateSwaps(meal: Meal): string[] {
  if ((meal as any).aiSwaps && (meal as any).aiSwaps.length > 0) {
    // Filter pre-existing swaps to ensure they're available for this restaurant
    return (meal as any).aiSwaps.filter((swap: string) => 
      isSwapAvailable(swap, meal.restaurant, meal.description)
    );
  }
  
  const swaps = [];
  
  // Generate swaps that are realistic for the restaurant
  if (meal.carbs > 40) {
    // Only suggest rice swap if restaurant likely offers alternatives
    const riceSwap = "Swap rice for cauliflower rice to save 150 cal";
    if (isSwapAvailable(riceSwap, meal.restaurant, meal.description)) {
      swaps.push(riceSwap);
    } else {
      // Alternative: suggest asking for less rice
      swaps.push("Ask for less rice to save ~100 cal");
    }
  }
  
  if (meal.fats > 20) {
    swaps.push("Ask for sauce on the side to reduce fat by 10g");
  }
  
  if (meal.protein < 30) {
    swaps.push("Double protein for +35g protein & 150 cal");
  }
  
  if (swaps.length === 0) {
    swaps.push("Remove cheese to save 80 calories");
  }
  
  return swaps;
}

// Helper to calculate protein density
function getProteinDensity(meal: Meal): { ratio: number; badge: { text: string; bg: string; emoji: string } | null } {
  if (meal.calories === 0) return { ratio: 0, badge: null };
  const ratio = meal.protein / meal.calories;
  
  if (ratio >= 0.15) {
    return {
      ratio,
      badge: { text: "Elite Protein", bg: "bg-yellow-500/20 border-yellow-500/40 text-yellow-600", emoji: "🏆" }
    };
  }
  if (ratio >= 0.08) {
    return {
      ratio,
      badge: { text: "Good Source", bg: "bg-blue-500/20 border-blue-500/40 text-blue-600", emoji: "💪" }
    };
  }
  return { ratio, badge: null };
}

function generateSmartTags(meal: Meal): Array<{ text: string; bg: string }> {
  const tags: Array<{ text: string; bg: string }> = [];
  
  // Based on macros
  if (meal.carbs < 15) {
    tags.push({ text: "Keto-Friendly", bg: "bg-purple-100 border-purple-300 text-purple-700" });
  }
  if (meal.calories < 500) {
    tags.push({ text: "Low Calorie", bg: "bg-green-100 border-green-300 text-green-700" });
  }
  if (meal.protein > 30) {
    tags.push({ text: "High Protein", bg: "bg-cyan-100 border-cyan-300 text-cyan-700" });
  }
  
  // Always include category if available
  if (meal.category) {
    const categoryText = meal.category === 'grocery' ? 'Grocery' : 'Restaurant';
    tags.push({ text: categoryText, bg: "bg-gray-100 border-gray-300 text-gray-700" });
  }
  
  return tags;
}

export function MealDetail({ meal, isFavorite, onToggleFavorite, onBack, onLogMeal }: Props) {
  // Modal States
  const [showLogModal, setShowLogModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  
  // Customization State
  const [selectedSwaps, setSelectedSwaps] = useState<string[]>([]);
  
  // Manual Form State
  const [manualName, setManualName] = useState('');
  const [manualCals, setManualCals] = useState('');
  const [manualPro, setManualPro] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFats, setManualFats] = useState('');

  if (!meal) return null;

  // State for similar meals
  const [similarMeals, setSimilarMeals] = useState<Meal[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);

  // Mock Data / Logic
  const rating = (meal as any).rating || 4.8;
  // Use calculated distance from meal if available, otherwise don't show
  const distance = meal.distance !== undefined && meal.distance !== null
    ? `${meal.distance.toFixed(1)} mi`
    : null;
  // Only show prepTime if we have real data, otherwise show nothing or "Nearby"
  const prepTime = meal.prepTime ? `${meal.prepTime} min` : null;
  const locationLabel = distance ? null : (meal.latitude && meal.longitude ? "Nearby" : null);
  const whyText = generateWhyText(meal);
  const aiSwaps = generateSwaps(meal);
  const smartTags = generateSmartTags(meal);
  const proteinDensity = getProteinDensity(meal);

  // Fetch similar meals from the same restaurant
  useEffect(() => {
    const fetchSimilarMeals = async () => {
      if (!meal.restaurant) return;
      
      setIsLoadingSimilar(true);
      try {
        // Search for meals from the same restaurant
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: meal.restaurant }),
        });
        
        const data = await res.json();
        let normalizedResults: any[] = [];
        
        if (Array.isArray(data)) {
          normalizedResults = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
          normalizedResults = data.results;
        }
        
        // Convert to Meal type and filter
        const allMeals = normalizedResults.map((item: any) => {
          // Handle fats - check fats_g (database column) first, then other variations
          const fats = item.fats_g ?? item.fat_g ?? item.fats ?? item.fat ?? 
                       (item.nutrition_info?.fats_g) ?? 
                       (item.nutrition_info?.fat_g) ?? 
                       (item.nutrition_info?.fats) ?? 
                       (item.nutrition_info?.fat) ?? 0;
          
          return {
            id: item.id || `meal-${Date.now()}-${Math.random()}`,
            name: item.item_name || item.name || 'Unknown Item',
            restaurant: item.restaurant_name || 'Unknown Restaurant',
            calories: item.calories || 0,
            protein: item.protein_g || 0,
            carbs: item.carbs_g || 0,
            fats: typeof fats === 'number' ? fats : 0,
            image: item.image_url || item.image || '',
            description: item.description || '',
            category: item.category === 'Grocery' || item.category === 'Hot Bar' ? 'grocery' as const : 'restaurant' as const,
          };
        });
        
        // Filter to same restaurant, exclude current meal, and take 3-5
        const similar = allMeals
          .filter((m: Meal) => 
            m.restaurant.toLowerCase() === meal.restaurant.toLowerCase() && 
            m.id !== meal.id &&
            m.calories >= 150 // Only full meals
          )
          .slice(0, 5);
        
        setSimilarMeals(similar);
      } catch (error) {
        console.error('Failed to fetch similar meals:', error);
        setSimilarMeals([]);
      } finally {
        setIsLoadingSimilar(false);
      }
    };

    fetchSimilarMeals();
  }, [meal.id, meal.restaurant]);

  const totalMacros = meal.protein + (meal.carbs || 0) + (meal.fats || 0);
  const pPercent = Math.round((meal.protein / totalMacros) * 100);
  const cPercent = Math.round(((meal.carbs || 0) / totalMacros) * 100);
  const fPercent = Math.round(((meal.fats || 0) / totalMacros) * 100);
  
  const calsRemaining = 850; 
  const calsAfter = calsRemaining - meal.calories;

  // --- HANDLERS ---
  const toggleSwap = (id: string) => {
    setSelectedSwaps(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleConfirmLog = () => {
    onLogMeal(); // In a real app, this would pass the modified meal data
    setShowLogModal(false);
    setSelectedSwaps([]);
  };

  const handleManualSubmit = () => {
    // Just close for now, logically would pass data to parent
    setShowManualModal(false);
    setManualName(''); setManualCals(''); setManualPro(''); setManualCarbs(''); setManualFats('');
  };
  
  const handleOrderOnline = () => {
    window.open("https://www.ubereats.com", "_blank");
  };

  const handleShare = async () => {
    // Create share text with meal information
    const shareText = `${meal.name} from ${meal.restaurant}\n` +
      `${meal.calories} cal • ${meal.protein}g protein • ${meal.carbs || 0}g carbs • ${meal.fats || 0}g fats`;
    
    const success = await copyToClipboard(shareText);
    
    if (success) {
      // You could show a toast notification here
      // For now, we'll just log success
      console.log('✅ Meal information copied to clipboard');
    } else {
      // You could show an error toast here
      console.error('❌ Failed to copy meal information');
    }
  };

  const isManualValid = manualName && manualCals;

  return (
    <div className="h-full w-full bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      {/* --- MOBILE-FIRST CONTAINER --- */}
      <div className="max-w-lg mx-auto shadow-2xl h-full bg-white w-full flex flex-col">
        {/* --- SCROLLABLE CONTENT --- */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-6 pb-safe"> 
        
        {/* HEADER IMAGE */}
        <div className="relative h-64 w-full shrink-0 bg-gradient-to-br from-cyan-500/20 via-blue-500/20 to-indigo-500/20">
          {meal.image && meal.image !== '/placeholder-food.jpg' && meal.image !== '' ? (
            <img 
              src={meal.image} 
              alt={meal.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to default.png if meal image fails
                e.currentTarget.src = '/logos/default.png';
                e.currentTarget.onerror = null;
              }}
            />
          ) : (
            <img 
              src="/logos/default.png" 
              alt="Default meal"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Final fallback - hide image if default.png also fails
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent"></div>
          <div className="absolute bottom-6 left-6 right-6 z-10">
            <h2 className="text-white text-xl font-bold drop-shadow-lg">{meal.name}</h2>
            <p className="text-white/80 text-sm mt-2">{meal.restaurant}</p>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent"></div>
          
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
            <button onClick={onBack} className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 hover:bg-black/60">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex gap-3">
              <button onClick={onToggleFavorite} className={`w-10 h-10 backdrop-blur-md rounded-full flex items-center justify-center border ${isFavorite ? 'bg-pink-500/20 text-pink-500 border-pink-500/50' : 'bg-black/40 text-white border-white/10'}`}>
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button 
                onClick={handleShare}
                className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
                aria-label="Share meal information"
              >
                <Share className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="px-5 -mt-6 relative z-10 space-y-6">
          
          {/* TITLE & INFO */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-foreground text-2xl font-bold leading-tight">{meal.name}</h1>
                  {proteinDensity.badge && (
                    <span className={`${proteinDensity.badge.bg} border px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 shrink-0`}>
                      <span>{proteinDensity.badge.emoji}</span>
                      <span>{proteinDensity.badge.text}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-lg shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 text-[10px] font-semibold">93% Match</span>
              </div>
            </div>
            <p className="text-muted-foreground text-sm mt-1 italic">"{whyText}"</p>
            <div className="flex items-center gap-3 mt-3 text-xs text-foreground/80">
               <span className="font-semibold text-foreground">{meal.restaurant}</span>
               {distance && (
                 <>
                   <span className="w-1 h-1 rounded-full bg-border"></span>
                   <div className="flex items-center gap-1">
                     <MapPin className="w-3 h-3 text-muted-foreground" />
                     {distance} away
                   </div>
                 </>
               )}
               {prepTime && (
                 <>
                   <span className="w-1 h-1 rounded-full bg-border"></span>
                   <div className="flex items-center gap-1">
                     <Clock className="w-3 h-3 text-muted-foreground" />
                     {prepTime} pickup
                   </div>
                 </>
               )}
               {locationLabel && (
                 <>
                   <span className="w-1 h-1 rounded-full bg-border"></span>
                   <div className="flex items-center gap-1">
                     <span className="text-xs text-muted-foreground">{locationLabel}</span>
                   </div>
                 </>
               )}
            </div>
          </div>

          {/* SMART TAGS */}
          <div>
            <p className="text-foreground text-sm font-semibold mb-3">Highlights</p>
            <div className="flex flex-wrap gap-2">
              {smartTags.map((tag, i) => (
                <span key={i} className={`${tag.bg} border px-3 py-1.5 rounded-full text-xs font-medium`}>
                  {tag.text}
                </span>
              ))}
            </div>
          </div>

          {/* MACROS CARD */}
          <div className="bg-card border border-border p-5 rounded-3xl shadow-lg relative overflow-hidden">
             <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="flex items-center justify-between mb-4">
              <p className="text-card-foreground text-sm font-semibold">Nutritional Information</p>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>

            {/* Calories - Purple/Pink Gradient (Moved here) */}
            <div className="mb-5">
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-3 text-center w-full">
                <Flame className="w-4 h-4 text-pink-400 mx-auto mb-1.5" />
                <p className="text-card-foreground text-xl font-bold leading-none mb-0.5">{meal.calories}</p>
                <p className="text-pink-300/60 text-[10px] font-medium uppercase">Calories</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border/50">
               <div className="text-center">
                 <div className="h-1 w-full bg-muted rounded-full mb-2 overflow-hidden">
                   <div style={{ width: `${cPercent}%` }} className="h-full bg-emerald-500 rounded-full"></div>
                 </div>
                 <p className="text-emerald-400 font-bold text-sm">{meal.carbs || 35}g</p>
                 <p className="text-muted-foreground text-[10px]">Carbs ({cPercent}%)</p>
               </div>
               <div className="text-center">
                 <div className="h-1 w-full bg-muted rounded-full mb-2 overflow-hidden">
                   <div style={{ width: `${fPercent}%` }} className="h-full bg-amber-500 rounded-full"></div>
                 </div>
                 <p className="text-amber-400 font-bold text-sm">{meal.fats || 12}g</p>
                 <p className="text-muted-foreground text-[10px]">Fats ({fPercent}%)</p>
               </div>
               <div className="text-center">
                 <div className="h-1 w-full bg-muted rounded-full mb-2 overflow-hidden">
                   <div style={{ width: `${pPercent}%` }} className="h-full bg-cyan-500 rounded-full"></div>
                 </div>
                 <p className="text-cyan-400 font-bold text-sm">{meal.protein}g</p>
                 <p className="text-muted-foreground text-[10px]">Protein ({pPercent}%)</p>
               </div>
            </div>
          </div>

          {/* IMPACT PREVIEW */}
          <div className="bg-card/50 rounded-2xl p-4 border border-border/80">
            <h3 className="text-foreground/80 text-xs font-semibold uppercase tracking-wider mb-3">Impact on Today</h3>
            <div className="flex items-center justify-between text-sm">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                     <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-foreground">Calories Remaining</p>
                    <p className="text-muted-foreground text-xs">If you eat this</p>
                  </div>
               </div>
               <div className="text-right">
                 <p className={`font-bold ${calsAfter < 0 ? 'text-red-400' : 'text-foreground'}`}>
                    {calsAfter} cal
                 </p>
                 <p className="text-muted-foreground text-xs">
                    {calsAfter < 0 ? 'Over budget' : 'Left for today'}
                 </p>
               </div>
            </div>
          </div>

          {/* AI SUGGESTED SWAPS - Changed to Indigo/Blue theme */}
          <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <p className="text-foreground font-medium">AI-Suggested Swaps</p>
              </div>
              <div className="space-y-2">
                {aiSwaps.map((swap, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/30 rounded-2xl p-4"
                  >
                    <p className="text-foreground/80 text-sm leading-snug">{swap}</p>
                  </div>
                ))}
              </div>
          </div>

          {/* SIMILAR OPTIONS */}
          {similarMeals.length > 0 && (
            <div className="mb-6">
              <p className="text-foreground text-sm font-semibold mb-3">Similar Options</p>
              {isLoadingSimilar ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Loading similar meals...</div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {similarMeals.map(similar => (
                    <div 
                      key={similar.id} 
                      className="bg-gradient-to-br from-card to-muted dark:from-gray-900 dark:to-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer overflow-hidden hover:border-cyan-500/50 hover:scale-[1.02] group relative border border-border"
                      onClick={() => {
                        // Navigate to meal detail - would need to be handled by parent
                        window.location.href = `#meal-${similar.id}`;
                      }}
                    >
                      {/* Image Container */}
                      <div 
                        className="relative w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-muted to-muted/50"
                        style={{
                          aspectRatio: '16 / 9',
                          padding: '10px'
                        }}
                      >
                        {/* Meal Image */}
                        {similar.image && similar.image !== '/placeholder-food.jpg' && similar.image !== '' ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <img 
                              src={similar.image} 
                              alt={similar.name}
                              className="w-full h-full object-contain object-center"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                objectPosition: 'center',
                                display: 'block',
                                maxWidth: '100%',
                                maxHeight: '100%'
                              }}
                              onError={(e) => {
                                // Fallback to default.png if meal image fails
                                e.currentTarget.src = '/logos/default.png';
                                e.currentTarget.onerror = null;
                              }}
                            />
                          </div>
                        ) : (
                          /* Fallback to default.png if no meal image */
                          <div className="w-full h-full flex items-center justify-center">
                            <img 
                              src="/logos/default.png" 
                              alt="Default meal"
                              className="w-full h-full object-contain object-center"
                              style={{ maxWidth: '100%', maxHeight: '100%' }}
                              onError={(e) => {
                                // Final fallback - hide image if default.png also fails
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-background dark:from-gray-950 via-background/20 dark:via-gray-950/20 to-transparent pointer-events-none" />
                      </div>

                      <div className="p-2.5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 pr-1">
                            <h3 className="text-foreground mb-0.5 font-semibold text-xs line-clamp-2 break-words leading-tight">{similar.name}</h3>
                            <div className="flex items-center gap-1 min-w-0">
                              <p className="text-muted-foreground text-[10px] truncate">{similar.restaurant}</p>
                            </div>
                            {similar.distance !== undefined && similar.distance !== null && (
                              <p className="text-muted-foreground mt-0.5 text-[9px]">{similar.distance.toFixed(1)} mi</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-1 text-[9px]">
                          <div className="bg-gradient-to-br from-pink-500/20 to-rose-500/20 rounded-md p-1 text-center border border-pink-500/30">
                            <div className="flex items-center justify-center mb-0.5">
                              <Flame className="w-2 h-2 text-pink-400" />
                            </div>
                            <p className="text-foreground font-bold text-[10px]">{similar.calories}</p>
                            <p className="text-pink-600 dark:text-pink-300/70 text-[8px]">cal</p>
                          </div>
                          <div className="bg-gradient-to-br from-cyan-400/20 to-blue-500/20 rounded-md p-1 text-center border border-cyan-400/30">
                            <div className="flex items-center justify-center mb-0.5">
                              <Zap className="w-2 h-2 text-cyan-400" />
                            </div>
                            <p className="text-foreground font-bold text-[10px]">{similar.protein}g</p>
                            <p className="text-cyan-600 dark:text-cyan-300/70 text-[8px]">pro</p>
                          </div>
                          <div className="bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-md p-1 text-center border border-green-400/30">
                            <div className="flex items-center justify-center mb-0.5">
                              <TrendingUp className="w-2 h-2 text-green-400" />
                            </div>
                            <p className="text-foreground font-bold text-[10px]">{similar.carbs}g</p>
                            <p className="text-green-600 dark:text-green-300/70 text-[8px]">carb</p>
                          </div>
                          <div className="bg-gradient-to-br from-amber-400/20 to-orange-500/20 rounded-md p-1 text-center border border-amber-400/30">
                            <div className="flex items-center justify-center mb-0.5">
                              <div className="w-2 h-2 rounded-full bg-amber-400" />
                            </div>
                            <p className="text-foreground font-bold text-[10px]">{similar.fats}g</p> 
                            <p className="text-amber-300/70 text-[8px]">fat</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* --- ACTION BUTTONS (Inside scrollable content, only visible when scrolled to bottom) --- */}
          <div className="mt-6 mb-6 space-y-2" style={{ height: '120px' }}>
            <button 
              onClick={() => setShowLogModal(true)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-[#020617] font-bold text-xs py-2 rounded-full shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              Log to Daily Tracker
            </button>
            
            <button 
              onClick={() => setShowManualModal(true)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 rounded-full shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Meal Manually
            </button>

            <button 
              onClick={handleOrderOnline}
              className="w-full rounded-full bg-muted border border-border text-foreground hover:bg-muted/80 font-medium text-xs py-2 flex items-center justify-center gap-2 transition-colors"
            >
              Order Online
              <ExternalLink className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* --- LOG MODAL (CUSTOMIZE) --- */}
      {showLogModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gradient-to-br from-card to-muted border-t border-border rounded-t-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-card-foreground font-semibold">Customize Your Meal</h2>
              <button onClick={() => setShowLogModal(false)} className="text-muted-foreground hover:text-foreground p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-muted-foreground text-sm mb-4">Did you make any of these AI-suggested swaps?</p>

            <div className="space-y-2 mb-6">
              {SWAP_OPTIONS.map(swap => {
                const isSelected = selectedSwaps.includes(swap.id);
                return (
                  <button
                    key={swap.id}
                    onClick={() => toggleSwap(swap.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500 shadow-lg shadow-cyan-500/20'
                        : 'bg-muted border-border hover:border-border/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-cyan-400 bg-cyan-500' : 'border-border'}`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="text-left">
                        <p className="text-card-foreground text-sm font-medium">{swap.label}</p>
                        <p className="text-muted-foreground text-xs">
                          {swap.protein ? `+${swap.protein}g protein • ` : ''}
                          {swap.calories > 0 ? '+' : ''}{swap.calories} cal
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Live Macro Preview */}
            {selectedSwaps.length > 0 && (
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-4 mb-6">
                <p className="text-purple-300 text-xs mb-2 uppercase font-bold">Updated Macros</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-card-foreground font-bold">{meal.calories + selectedSwaps.reduce((sum, id) => sum + (SWAP_OPTIONS.find(s => s.id === id)?.calories || 0), 0)}</p>
                    <p className="text-muted-foreground text-[10px]">cal</p>
                  </div>
                  <div>
                    <p className="text-card-foreground font-bold">{meal.protein + selectedSwaps.reduce((sum, id) => sum + (SWAP_OPTIONS.find(s => s.id === id)?.protein || 0), 0)}g</p>
                    <p className="text-muted-foreground text-[10px]">pro</p>
                  </div>
                  <div>
                    <p className="text-card-foreground font-bold">{meal.carbs + selectedSwaps.reduce((sum, id) => sum + (SWAP_OPTIONS.find(s => s.id === id)?.carbs || 0), 0)}g</p>
                    <p className="text-muted-foreground text-[10px]">carbs</p>
                  </div>
                  <div>
                    <p className="text-card-foreground font-bold">{meal.fats + selectedSwaps.reduce((sum, id) => sum + (SWAP_OPTIONS.find(s => s.id === id)?.fats || 0), 0)}g</p>
                    <p className="text-muted-foreground text-[10px]">fats</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowLogModal(false)} className="flex-1 h-12 rounded-full bg-muted border border-border text-foreground font-medium hover:bg-muted/80">
                Cancel
              </button>
              <button onClick={handleConfirmLog} className="flex-1 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium shadow-lg shadow-green-500/30 flex items-center justify-center">
                <Plus className="mr-2 w-5 h-5" />
                Log Meal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MANUAL ADD MODAL --- */}
      {showManualModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gradient-to-br from-card to-muted border-t border-border rounded-t-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-card-foreground font-semibold">Add Meal Manually</h2>
              <button onClick={() => setShowManualModal(false)} className="text-muted-foreground hover:text-foreground p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Meal Name</label>
                <input 
                  value={manualName} 
                  onChange={e => setManualName(e.target.value)} 
                  placeholder="e.g. Grilled Chicken Salad"
                  className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-4 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Calories</label>
                <input 
                  type="number" 
                  value={manualCals} 
                  onChange={e => setManualCals(e.target.value)} 
                  placeholder="500"
                  className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-4 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Protein (g)</label>
                  <input type="number" value={manualPro} onChange={e => setManualPro(e.target.value)} placeholder="30" className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-3 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Carbs (g)</label>
                  <input type="number" value={manualCarbs} onChange={e => setManualCarbs(e.target.value)} placeholder="40" className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-3 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Fats (g)</label>
                  <input type="number" value={manualFats} onChange={e => setManualFats(e.target.value)} placeholder="15" className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-3 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowManualModal(false)} className="flex-1 h-12 rounded-full bg-muted border border-border text-foreground font-medium hover:bg-muted/80">
                Cancel
              </button>
              <button 
                onClick={handleManualSubmit} 
                disabled={!isManualValid}
                className={`flex-1 h-12 rounded-full font-medium shadow-lg flex items-center justify-center transition-all ${isManualValid ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/30 hover:shadow-cyan-500/50' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
              >
                <Check className="mr-2 w-5 h-5" />
                Add Meal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Style */}
      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}