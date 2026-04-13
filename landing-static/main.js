(function () {
  var config = {
    appBaseUrl: "https://app.seekeatz.com",
    heroVideoSrc: "hero-phone.mp4",
    heroPosterSrc: "hero-poster.jpg",
  };

  function normalizeBase(url) {
    return url.replace(/\/+$/, "");
  }

  function setAppLinks() {
    var base = normalizeBase(config.appBaseUrl);
    document.querySelectorAll("[data-app-route]").forEach(function (node) {
      var route = node.getAttribute("data-app-route") || "";
      node.setAttribute("href", base + route);
    });
  }

  function setupHeroMedia() {
    var video = document.querySelector("[data-hero-video]");
    var fallback = document.querySelector("[data-hero-fallback]");
    var wrap = video ? video.parentElement : null;

    if (!video || !fallback || !wrap) return;

    video.poster = config.heroPosterSrc;
    fallback.src = config.heroPosterSrc;

    var source = video.querySelector("source");
    if (source) {
      source.src = config.heroVideoSrc;
      video.load();
    }

    function useFallback() {
      wrap.classList.add("has-fallback");
    }

    video.addEventListener("error", useFallback);

    if (source) {
      source.addEventListener("error", useFallback);
    }
  }

  function setupNav() {
    var shell = document.querySelector("[data-nav-shell]");
    var toggle = document.querySelector("[data-nav-toggle]");
    var panel = document.querySelector("[data-mobile-panel]");
    var brand = document.querySelector(".brand-mark");

    function syncScroll() {
      if (!shell) return;
      shell.classList.toggle("is-scrolled", window.scrollY > 40);
    }

    if (toggle && panel) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
      });

      panel.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          toggle.setAttribute("aria-expanded", "false");
          panel.hidden = true;
        });
      });
    }

    if (brand) {
      brand.addEventListener("click", function () {
        window.dispatchEvent(new CustomEvent("seekResetAnimations"));
      });
    }

    window.addEventListener("scroll", syncScroll, { passive: true });
    syncScroll();
  }

  function setupPreviewTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]"));
    var panels = Array.prototype.slice.call(document.querySelectorAll("[data-panel]"));

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-tab");

        tabs.forEach(function (node) {
          var active = node === tab;
          node.classList.toggle("is-active", active);
          node.setAttribute("aria-selected", active ? "true" : "false");
        });

        panels.forEach(function (panel) {
          panel.classList.toggle("is-active", panel.getAttribute("data-panel") === target);
        });
      });
    });
  }

  function setupSolutionReveal() {
    var button = document.querySelector("[data-reveal-solution]");
    var card = document.querySelector("[data-solution-card]");
    var section = document.querySelector("[data-problem-solution]");

    if (!button || !card) return;

    button.addEventListener("click", function () {
      if (section) {
        section.classList.add("solution-revealed");
      }

      card.hidden = false;

      window.requestAnimationFrame(function () {
        card.classList.add("is-visible");
      });

      button.disabled = true;
      button.textContent = "Here's how we fix it";
    });
  }

  function setupFadeIns() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(".fade-up"));
    if (!nodes.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 }
    );

    nodes.forEach(function (node) {
      observer.observe(node);
    });

    window.addEventListener("seekResetAnimations", function () {
      var section = document.querySelector("[data-problem-solution]");
      var card = document.querySelector("[data-solution-card]");
      var button = document.querySelector("[data-reveal-solution]");

      if (section) {
        section.classList.remove("solution-revealed");
      }

      if (card) {
        card.classList.remove("is-visible");
        card.hidden = true;
      }

      if (button) {
        button.disabled = false;
        button.textContent = "See how SeekEatz fixes this";
      }

      nodes.forEach(function (node) {
        node.classList.remove("is-visible");
        observer.observe(node);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setAppLinks();
    setupHeroMedia();
    setupNav();
    setupPreviewTabs();
    setupSolutionReveal();
    setupFadeIns();
  });
})();
