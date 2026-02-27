#!/usr/bin/env python3
"""
Clean menu data: Remove kids items and single-ingredient items (<=100 cal)
from all JSON files in data/jsons/ and generate SQL to clean the database.

Usage:
    python3 scripts/clean-menu-data.py          # Preview what will be removed (dry run)
    python3 scripts/clean-menu-data.py --apply  # Actually modify the JSON files
"""

import json
import os
import sys
import glob
import re

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'jsons')
CALORIE_THRESHOLD = 100  # Remove items with calories <= this value
APPLY = '--apply' in sys.argv


def should_remove(item):
    """Returns (should_remove: bool, reason: str)"""
    name = item.get('name', '').lower()
    category = item.get('category', '').lower()
    calories = item.get('macros', {}).get('calories', 999)
    
    # 1. Kids menu items (by name or category)
    kids_patterns = ['kid\'s', 'kids', 'kid ', 'children', 'kiddie']
    for pattern in kids_patterns:
        if pattern in name or pattern in category:
            return True, f"kids_item (cal={calories})"
    
    # 2. Single ingredient / low calorie items (<=100 cal)
    if calories <= CALORIE_THRESHOLD:
        return True, f"low_cal ({calories} cal)"
    
    return False, ""


def process_files():
    files = sorted(glob.glob(os.path.join(DATA_DIR, '*_raw.json')))
    
    total_removed = 0
    total_kept = 0
    all_removed_items = []  # For SQL generation
    
    print(f"{'=' * 70}")
    print(f"MENU DATA CLEANUP {'(DRY RUN)' if not APPLY else '(APPLYING CHANGES)'}")
    print(f"{'=' * 70}")
    print(f"Calorie threshold: <= {CALORIE_THRESHOLD}")
    print(f"Files to process: {len(files)}")
    print()
    
    for filepath in files:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        restaurant = data.get('restaurant_name', os.path.basename(filepath))
        items = data.get('items', [])
        original_count = len(items)
        
        kept = []
        removed = []
        
        for item in items:
            remove, reason = should_remove(item)
            if remove:
                removed.append((item, reason))
                all_removed_items.append({
                    'restaurant_name': restaurant,
                    'name': item['name'],
                    'reason': reason
                })
            else:
                kept.append(item)
        
        if removed:
            print(f"\n--- {restaurant} ({os.path.basename(filepath)}) ---")
            print(f"    Original: {original_count} | Removing: {len(removed)} | Keeping: {len(kept)}")
            for item, reason in removed:
                cal = item.get('macros', {}).get('calories', '?')
                print(f"    ✗ [{cal} cal] {item['name']} ({item.get('category', '')}) → {reason}")
        
        total_removed += len(removed)
        total_kept += len(kept)
        
        if APPLY and removed:
            data['items'] = kept
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"    ✅ File updated!")
    
    print(f"\n{'=' * 70}")
    print(f"SUMMARY")
    print(f"{'=' * 70}")
    print(f"Total items removed: {total_removed}")
    print(f"Total items kept:    {total_kept}")
    
    if not APPLY:
        print(f"\n⚠️  DRY RUN — No files were modified.")
        print(f"    Run with --apply to modify JSON files:")
        print(f"    python3 scripts/clean-menu-data.py --apply")
    
    # Generate SQL for database cleanup
    print(f"\n{'=' * 70}")
    print(f"SQL TO DELETE FROM DATABASE")
    print(f"{'=' * 70}")
    print(f"-- Run this in Supabase SQL Editor to remove these items from menu_items table")
    print()
    
    # Group by reason for clarity
    print("-- Delete kids menu items")
    kids_items = [i for i in all_removed_items if 'kids_item' in i['reason']]
    if kids_items:
        print("DELETE FROM menu_items WHERE")
        conditions = []
        for item in kids_items:
            escaped_name = item['name'].replace("'", "''")
            escaped_restaurant = item['restaurant_name'].replace("'", "''")
            conditions.append(f"  (restaurant_name = '{escaped_restaurant}' AND name = '{escaped_name}')")
        print(" OR\n".join(conditions))
        print(";")
    else:
        print("-- No kids items found")
    
    print()
    print("-- Delete low calorie / single ingredient items (<=100 cal)")
    print("DELETE FROM menu_items")
    print(f"WHERE (macros->>'calories')::int <= {CALORIE_THRESHOLD};")
    
    print()
    print("-- Verify: Count remaining items")
    print("SELECT COUNT(*) as remaining_items FROM menu_items;")
    print()
    
    # Also write SQL to a file for convenience
    sql_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'cleanup_menu_items.sql')
    with open(sql_file, 'w') as f:
        f.write("-- AUTO-GENERATED: Cleanup script for menu_items table\n")
        f.write(f"-- Generated by clean-menu-data.py\n")
        f.write(f"-- Items to remove: {total_removed}\n\n")
        
        f.write("-- Step 1: Delete kids menu items by name\n")
        if kids_items:
            f.write("DELETE FROM menu_items WHERE\n")
            conditions = []
            for item in kids_items:
                escaped_name = item['name'].replace("'", "''")
                escaped_restaurant = item['restaurant_name'].replace("'", "''")
                conditions.append(f"  (restaurant_name = '{escaped_restaurant}' AND name = '{escaped_name}')")
            f.write(" OR\n".join(conditions))
            f.write(";\n\n")
        
        f.write(f"-- Step 2: Delete all items with calories <= {CALORIE_THRESHOLD}\n")
        f.write("DELETE FROM menu_items\n")
        f.write(f"WHERE (macros->>'calories')::int <= {CALORIE_THRESHOLD};\n\n")
        
        f.write("-- Step 3: Verify remaining count\n")
        f.write("SELECT COUNT(*) as remaining_items FROM menu_items;\n")
    
    print(f"📄 SQL also saved to: cleanup_menu_items.sql")


if __name__ == '__main__':
    process_files()
