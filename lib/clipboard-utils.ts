/**
 * Safe clipboard utility that handles SSR, browser compatibility, and permissions
 */

/**
 * Shows a user-friendly toast message
 */
function showToast(message: string, type: 'success' | 'error' = 'error') {
  // Create toast element
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#ef4444' : '#10b981'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    font-size: 14px;
    font-weight: 500;
    max-width: 90%;
    text-align: center;
    animation: slideUp 0.3s ease-out;
  `;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;
  if (!document.head.querySelector('#toast-animations')) {
    style.id = 'toast-animations';
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease-out reverse';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

/**
 * Copies text to clipboard with fallback support
 * @param text - The text to copy
 * @param showUserMessage - Whether to show user-friendly error messages (default: true)
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function copyToClipboard(text: string, showUserMessage: boolean = true): Promise<boolean> {
  // Only run in browser (not during SSR/build)
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.warn('⚠️ Clipboard: Not available (server-side rendering)');
    return false;
  }

  // Check if navigator exists and has clipboard API (with proper optional chaining)
  if (typeof navigator !== 'undefined' && !!navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      if (showUserMessage) {
        showToast('Copied to clipboard!', 'success');
      }
      return true;
    } catch (error: any) {
      // Check if it's a permission error
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        console.warn('⚠️ Clipboard: Permission denied. Copy requires HTTPS or user permission.');
        // Fall through to fallback method
      } else {
        console.warn('⚠️ Clipboard: Modern API failed, trying fallback:', error.message);
        // Fall through to fallback method
      }
    }
  }

  // Fallback: Use hidden textarea + execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    textarea.style.opacity = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    
    // Select text (works better on mobile)
    if (navigator.userAgent.match(/ipad|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textarea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textarea.setSelectionRange(0, 999999);
    } else {
      textarea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (successful) {
      if (showUserMessage) {
        showToast('Copied to clipboard!', 'success');
      }
      return true;
    } else {
      if (showUserMessage) {
        showToast('Copy failed — please copy manually.', 'error');
      }
      console.warn('⚠️ Clipboard: Fallback method failed. Copy may not be available due to non-HTTPS or permissions.');
      return false;
    }
  } catch (error: any) {
    if (showUserMessage) {
      showToast('Copy failed — please copy manually.', 'error');
    }
    console.warn('⚠️ Clipboard: All copy methods failed:', error.message);
    console.warn('⚠️ Clipboard: Copy may not be available due to non-HTTPS or permissions.');
    return false;
  }
}

/**
 * Checks if clipboard is available in the current environment
 * @returns boolean - true if clipboard is likely available
 */
export function isClipboardAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for modern clipboard API (with proper optional chaining)
  if (typeof navigator !== 'undefined' && !!navigator.clipboard) {
    return true;
  }

  // Check for fallback method
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    return true;
  }

  return false;
}

