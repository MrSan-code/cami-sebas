// Shared helpers for the /QR pages.
// The guest identity uses the same storage key as /juegos/, so picking your
// name here also signs you in to the games (and the other way around).
(function () {
  var GUEST_KEY = 'cys-juegos:guest';
  var guestsPromise = null;

  var memoryGuest = null;

  function me() {
    try {
      var guest = JSON.parse(localStorage.getItem(GUEST_KEY));
      return guest && guest.id ? guest : null;
    } catch (e) {
      return memoryGuest;
    }
  }

  function setMe(guest) {
    memoryGuest = guest ? { id: guest.id, name: guest.name } : null;
    try {
      if (memoryGuest) localStorage.setItem(GUEST_KEY, JSON.stringify(memoryGuest));
      else localStorage.removeItem(GUEST_KEY);
    } catch (e) { /* storage blocked: identity lasts for this page only */ }
  }

  function normalize(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function loadGuests(url) {
    if (!guestsPromise) {
      guestsPromise = fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          return data.map(function (g) {
            return { id: g.id, name: g.name, key: normalize(g.name) };
          });
        })
        .catch(function () { return []; });
    }
    return guestsPromise;
  }

  function search(guests, query, limit) {
    var q = normalize(query.trim());
    if (q.length < 2) return null;
    var terms = q.split(/\s+/);
    return guests.filter(function (g) {
      return terms.every(function (t) { return g.key.indexOf(t) !== -1; });
    }).slice(0, limit || 8);
  }

  function firstName(name) {
    return name.replace(/\s*\(.*\)\s*/g, ' ').trim().split(/\s+/)[0];
  }

  window.QR = {
    me: me,
    setMe: setMe,
    loadGuests: loadGuests,
    search: search,
    firstName: firstName
  };
})();
