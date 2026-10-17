(function () {
  var STORAGE_KEY = 'nilma_ads_consent';
  var CONVERSION_SEND_TO = 'AW-18505774620/1s2kCJCYjaAdEJzsnvhE';

  function grantConsent() {
    if (typeof gtag !== 'function') return;
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted'
    });
  }

  function getStoredChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function storeChoice(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (err) {}
  }

  var stored = getStoredChoice();
  if (stored === 'granted') {
    grantConsent();
  }

  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest
      ? e.target.closest('a[href*="wa.me"], a[href*="whatsapp"]')
      : null;
    if (!link || typeof gtag !== 'function') return;
    gtag('event', 'conversion', {
      send_to: CONVERSION_SEND_TO,
      event_callback: function () {}
    });
  }, true);

  if (stored === 'granted' || stored === 'denied') return;

  var banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-label', 'Aviso de cookies');
  banner.innerHTML =
    '<p>Usamos cookies para medir o desempenho dos nossos anúncios e melhorar o site. Você pode aceitar ou recusar. Saiba mais na nossa <a href="privacidade.html">Política de Privacidade</a>.</p>' +
    '<div class="cookie-banner-actions">' +
    '<button type="button" class="cookie-accept">Aceitar</button>' +
    '<button type="button" class="cookie-reject">Recusar</button>' +
    '</div>';

  function hideBanner() {
    if (banner.parentNode) banner.parentNode.removeChild(banner);
  }

  banner.querySelector('.cookie-accept').addEventListener('click', function () {
    storeChoice('granted');
    grantConsent();
    hideBanner();
  });

  banner.querySelector('.cookie-reject').addEventListener('click', function () {
    storeChoice('denied');
    hideBanner();
  });

  function mount() {
    document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
