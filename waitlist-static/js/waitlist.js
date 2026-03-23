/**
 * Static waitlist — no API, no env vars.
 * Submit: client-side only; goes to ./thanks.html (add your own backend later).
 * When opened as file://, share/copy use PUBLIC_SITE_URL for social links.
 */
var PUBLIC_SITE_URL = 'https://seekeatz.com/';

var SHARE_TEXT =
  'Find meals that fit your macros — instantly. SeekEatz uses AI + verified restaurant nutrition to recommend real meals near you. Join the waitlist!';

function getShareUrl() {
  if (location.protocol === 'file:') return PUBLIC_SITE_URL;
  var o = location.origin;
  return o.endsWith('/') ? o : o + '/';
}

function syncEmailInputs(source) {
  document.querySelectorAll('input[name="email"]').forEach(function (el) {
    if (el !== source) el.value = source.value;
  });
}

function setLoading(loading) {
  document.querySelectorAll('[data-waitlist-submit]').forEach(function (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Joining...' : 'Join the Waitlist →';
  });
}

function handleSubmit(event) {
  event.preventDefault();
  setLoading(true);
  setTimeout(function () {
    location.href = './thanks.html';
  }, 400);
}

function setupFade() {
  var nodes = document.querySelectorAll('[data-fade]');
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('is-visible');
      });
    },
    { threshold: 0.12 }
  );
  nodes.forEach(function (el) {
    observer.observe(el);
  });
}

var copiedTimer = null;
function setCopiedUi(copied) {
  var shareBtn = document.querySelector('[data-share-native]');
  var copyLinkBtn = document.querySelector('[data-copy-link]');
  if (shareBtn) shareBtn.textContent = copied ? '✓ Copied!' : 'Share';
  if (copyLinkBtn)
    copyLinkBtn.textContent = copied
      ? '✓ Copied to clipboard!'
      : '🔗 Copy link to share anywhere';
  if (copiedTimer) clearTimeout(copiedTimer);
  if (copied) copiedTimer = setTimeout(function () { setCopiedUi(false); }, 2000);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('no clipboard'));
}

function handleShare() {
  var shareUrl = getShareUrl();
  if (navigator.share) {
    navigator
      .share({
        title: 'SeekEatz — Join the Waitlist',
        text: SHARE_TEXT,
        url: shareUrl,
      })
      .catch(function () {});
  } else {
    copyText(shareUrl).then(
      function () { setCopiedUi(true); },
      function () {
        window.prompt('Copy this link:', shareUrl);
      }
    );
  }
}

function handleCopyLink() {
  copyText(getShareUrl()).then(
    function () { setCopiedUi(true); },
    function () {
      window.prompt('Copy this link:', getShareUrl());
    }
  );
}

function setupShareLinks() {
  var base = getShareUrl();
  var wa = document.querySelector('[data-share-wa]');
  var tw = document.querySelector('[data-share-tw]');
  var fb = document.querySelector('[data-share-fb]');
  var li = document.querySelector('[data-share-li]');
  var rd = document.querySelector('[data-share-rd]');

  if (wa)
    wa.href = 'https://wa.me/?text=' + encodeURIComponent(SHARE_TEXT + ' ' + base);
  if (tw)
    tw.href =
      'https://twitter.com/intent/tweet?text=' +
      encodeURIComponent(SHARE_TEXT) +
      '&url=' +
      encodeURIComponent(base);
  if (fb)
    fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(base);
  if (li)
    li.href =
      'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(base);
  if (rd)
    rd.href =
      'https://www.reddit.com/submit?url=' +
      encodeURIComponent(base) +
      '&title=' +
      encodeURIComponent(
        'SeekEatz - AI-powered meal recommendations that fit your macros'
      );
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('form[data-waitlist-form]').forEach(function (form) {
    form.addEventListener('submit', handleSubmit);
  });

  document.querySelectorAll('input[name="email"]').forEach(function (input) {
    input.addEventListener('input', function () {
      syncEmailInputs(input);
    });
  });

  var shareBtn = document.querySelector('[data-share-native]');
  if (shareBtn) shareBtn.addEventListener('click', handleShare);

  var copyLinkBtn = document.querySelector('[data-copy-link]');
  if (copyLinkBtn) copyLinkBtn.addEventListener('click', handleCopyLink);

  var ig = document.querySelector('[data-share-ig]');
  if (ig) {
    ig.addEventListener('click', function (e) {
      e.preventDefault();
      copyText(getShareUrl()).then(
        function () { setCopiedUi(true); },
        function () {
          window.prompt('Copy this link:', getShareUrl());
        }
      );
    });
  }

  setupShareLinks();
  setupFade();
});
